/**
 * SurvivalGamesParser - team mode (in-game teams are "District N"), kills only,
 * last team standing wins.
 *
 * Teams are assigned manually in the app; District labels are resolved purely via
 * player membership (a District line credits whichever app team the players are on).
 *   "» sparkskye killed Quapot"
 *   "» SandRosey ten hearted Bo0ky"  /  "» Akumatizedd obliterated Galaxy 12000"
 *   "» District 3 has been ELIMINATED!"
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SurvivalGamesParser extends Base {
        get name() { return 'Survival Games'; }

        detect(clean) {
            if (this.detectDistrictElimination(clean)) return true;
            // "You were killed by X" -> local player death + credit killer.
            if (this.detectGenericKill(clean)) return true;
            // Single registered player as killer against unregistered victim.
            // Only fire when the player is the SUBJECT of the line (starts the action)
            // and it's not a heartbeat/status message.
            if (!this.isLobbyLine(clean) && !/\bhas \d+(\.\d+)? hearts?\b/i.test(clean)) {
                const { ChatUtils } = global.Hive;
                const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());
                if (players.length === 1 && !this.selfDeathPhrases.some(p => clean.toLowerCase().includes(p))) {
                    const name = players[0];
                    // Player must appear at the start of the action (after optional "» ").
                    const stripped = clean.replace(/^»\s*/, '');
                    if (stripped.startsWith(name) && this.state.findPlayerTeam(name)) {
                        return this.recordKillPointOnly(name) !== false;
                    }
                }
            }
            return false;
        }

        onGameOver(clean) {
            // Base ranks every player by elimination order and scores each from their
            // own placement (Survival Games is now individual-survival, like a battle royale).
            super.onGameOver(clean);
            this.state.addLog('Survival Games game over', 'info');
        }

        /**
         * "District N has been ELIMINATED!" - there is no color name, so resolve to
         * the app team whose members were eliminated this round. We pick the team
         * with the most already-eliminated, not-yet-recorded players.
         */
        detectDistrictElimination(clean) {
            if (!/District\s+\d+\s+has been\s+ELIMINATED/i.test(clean)) return false;

            // First: try to find a team where ALL players are eliminated.
            let candidate = this.engine.getActiveTeams().find(teamName => {
                const players = this.state.teams[teamName].players || [];
                if (players.length === 0) return false;
                return players.every(p => this.state.playerStats[p] && this.state.playerStats[p].eliminated);
            });

            // Fallback: use structural inference (most eliminated players on any unresolved team).
            if (!candidate) candidate = this._inferEliminatedTeam();

            if (!candidate) {
                this.state.addLog('District eliminated (unmapped to an app team)', 'warning');
                return true;
            }
            this.state.eliminationOrder.push(candidate);
            this.state.addLog(`${candidate} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            // Individual-survival scoring: a wiped district only marks its players out;
            // each player's placement is finalised per-player at game over.
            if (!this.features.individualSurvival) {
                this.engine.recordTeamEliminationPlacement(candidate);
                this.engine.tryFinalize();
            }
            return true;
        }
    }

    global.Hive.parsers['Survival Games'] = SurvivalGamesParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SurvivalGamesParser;
})(typeof window !== 'undefined' ? window : globalThis);
