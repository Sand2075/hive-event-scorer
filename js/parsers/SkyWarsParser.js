/**
 * SkyWarsParser - team mode, kills only, last team standing wins.
 *
 * Kills use arbitrary flavour verbs between two players, so detection is purely
 * structural (handled by the base detectGenericKill). Self-deaths ("did an
 * oopsie!") credit no kill.
 *   "» NoahNacho27 rolled Bo0ky beyond space and time!"
 *   "» Ka1d4r3 silenced Galaxy 12000"
 *   "» Red Team has been ELIMINATED!"
 *   "» Lime Team are the WINNERS!"
 * Noise ignored: "... is the new kill leader!", "Mystery Chest was opened by ...".
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SkyWarsParser extends Base {
        get name() { return 'SkyWars'; }

        isNoise(clean) {
            return /is the new kill leader/i.test(clean) ||
                /Mystery Chest was opened by/i.test(clean) ||
                /spellbook for you/i.test(clean) ||
                /wasn't very lucky/i.test(clean) ||
                /minimum play height/i.test(clean) ||
                /Your tracking compass is pointing to the nearest player/i.test(clean);
        }

        detect(clean) {
            // Track kill-leader announcements before generic noise filtering.
            const leaderMatch = clean.match(/»?\s*(.+?)\s+is the new kill leader!?$/i);

            if (leaderMatch) {
                const playerName = leaderMatch[1].trim();
                const teamName = this.resolvePlayerTeam(playerName);

                if (!teamName) return false;

                // Store the current leader, but do not award yet.
                // The +15 should only go to the kill leader at the end of the game.
                this.state.skyWarsKillLeader = playerName;

                return true;
            }

            if (this.isNoise(clean)) return false;

            if (this.detectWinner(clean)) {
                this.awardFinalKillLeader();
                return true;
            }

            if (this.detectTeamElimination(clean)) return true;

            // "You were killed by X" -> local player death + credit killer.
            const m = clean.match(
                /»?\s*You were killed by\s+(.+?)(?:\.\s*They had\s+[\d.]+\s+hearts?)?\s*$/i
            );

            if (m) {
                const victim = this.resolvePlayerName('You');
                const killerName = m[1].trim().replace(/\.$/, '');

                if (victim && killerName) {
                    return this.recordKill(killerName, victim) !== false;
                }

                if (victim) {
                    return this.recordDeath(victim) !== false;
                }
            }

            // "You were killed by SandRosey. They had 14.5 hearts"
            const killedByMatch = clean.match(
                /You were killed by\s+([A-Za-z0-9_]+)(?:\.\s*They had\s+[\d.]+\s+hearts?)?/i
            );

            if (killedByMatch) {
                const killerName = killedByMatch[1];
                const victim = this.resolvePlayerName('You');

                // Always credit the known killer, even if "You" cannot be resolved.
                const killerTeam = this.resolvePlayerTeam(killerName);

                if (killerTeam) {
                    const ks = this.state.getOrCreatePlayerStats(killerName, killerTeam);
                    ks.kills++;

                    this.engine.awardPoints(killerTeam, 'Kill');

                    this.state.ensureScore(killerTeam).kills.push({
                        player: killerName,
                        victim: victim || 'You',
                        time: new Date().toISOString()
                    });
                }

                // Only record the victim elimination when My IGN is configured.
                if (victim) {
                    const victimTeam = this.resolvePlayerTeam(victim);

                    if (victimTeam) {
                        const vs = this.state.getOrCreatePlayerStats(victim, victimTeam);
                        vs.deaths++;
                        this.markEliminated(victim, victimTeam);
                    }
                }

                this.state.addLog(
                    `${killerName} eliminated ${victim || 'You'}`,
                    'success'
                );

                return true;
            }

            if (this.detectGenericKill(clean)) return true;

            return false;
        }

        awardFinalKillLeader() {
            const playerName = this.state.skyWarsKillLeader;

            if (!playerName) return;

            const teamName = this.state.findPlayerTeam(playerName);

            if (!teamName || !this.engine.isScorableTeam(teamName)) return;

            const score = this.state.ensureScore(teamName);

            const alreadyAwarded = score.events.some(event =>
                event.type === 'Kill Leader' &&
                event.player === playerName
            );

            if (alreadyAwarded) return;

            const points = this.engine.awardPoints(teamName, 'Kill Leader');

            if (points > 0) {
                const lastEvent = score.events[score.events.length - 1];

                if (lastEvent && lastEvent.type === 'Kill Leader') {
                    lastEvent.player = playerName;
                }

                this.state.addLog(
                    `${playerName} finished as the SkyWars kill leader!`,
                    'success'
                );
            }
        }

        onGameOver(clean) {
            this.awardFinalKillLeader();
            super.onGameOver(clean);
        }
    }

    global.Hive.parsers.SkyWars = SkyWarsParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SkyWarsParser;
})(typeof window !== 'undefined' ? window : globalThis);
