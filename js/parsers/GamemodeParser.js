/**
 * GamemodeParser - base class for all gamemode interpreters.
 *
 * A parser turns one line of Hive chat into scoring events by mutating GameState
 * through the shared ScoringEngine. The base provides the common building blocks
 * found across Hive modes; subclasses override `features`, `name`, and the small
 * set of detectors unique to their mode.
 *
 * Detection philosophy (per requirement): combat kills are matched *structurally*
 * via the registered players present in a line, NOT by a hard-coded verb list, so
 * any flavour verb ("rolled ... beyond space and time", "ten hearted", "silenced")
 * is interpreted correctly: first registered player = killer, last = victim.
 */
(function (global) {
    'use strict';

    const ChatUtils = global.Hive.ChatUtils;

    class GamemodeParser {
        /**
         * @param {GameState} state
         * @param {ScoringEngine} engine
         * @param {PointSystem} points
         */
        constructor(state, engine, points) {
            this.state = state;
            this.engine = engine;
            this.points = points;
        }

        get name() { return 'Base'; }

        /** Feature flags; falls back to PointSystem's table for this gamemode. */
        get features() {
            return this.points.featuresFor(this.name) || {};
        }

        // Phrases that mean "this player died with no killer" - they end an
        // otherwise kill-shaped line, so they must NOT credit a kill.
        get selfDeathPhrases() {
            return ['did an oopsie', 'you died', 'forgot their parachute', 'fell off',
                'fell to their demise', 'said goodbye to this cruel world', "got ratio'd",
                'made their last dance move', "ain't stayin' alive", 'has two left feet',
                "rock 'n' rolled into the void"];
        }

        /**
         * Parse a single RAW chat line. Returns true if a scoring-relevant event
         * was recorded. Shared front-door: strip colors, skip player chat, then
         * dispatch to detectors. Subclasses usually override `detect()` only.
         */
        parseLine(rawLine) {
            if (ChatUtils.isPlayerChatLine(rawLine)) return false;
            const clean = ChatUtils.stripColorCodes(rawLine);
            if (!clean) return false;

            if (/game over!?/i.test(clean)) {
                this.onGameOver(clean);
                // Game-over is informational; let other detectors still run on the
                // same line in case a winner is announced separately.
            }
            return this.detect(clean, rawLine);
        }

        /** Subclasses implement mode-specific detection. */
        detect(/* clean, raw */) {
            return false;
        }

        onGameOver(/* clean */) {
            this.state.currentGameCompleted = true;
        }

        // ---- shared detectors --------------------------------------------

        /**
         * Returns true for lobby/server system messages that contain player names
         * but are NOT combat events and must never be scored as kills/deaths.
         */
        isLobbyLine(clean) {
            return /has (?:gone )?offline\b/i.test(clean) ||
                /has come online\b/i.test(clean) ||
                /joined\.\s*\[\d+\/\d+\]/i.test(clean) ||
                /\bset .+?'s role to\b/i.test(clean) ||
                /\bset .+? to\b/i.test(clean) ||
                /\bsent an invite to\b/i.test(clean) ||
                /\brank to\b/i.test(clean) ||
                /\bupgraded\b.*\bby\b/i.test(clean) ||
                /\bunlocked\b.*\bby\b/i.test(clean);
        }

        /**
         * Generic flavour-verb kill: a non-chat line containing two registered
         * players. Killer = first appearance, victim = last. Self-death phrases or
         * a single player present mean death-only (no kill credit).
         * Returns 'kill' | 'death' | false.
         */
        detectGenericKill(clean) {
            if (this.isLobbyLine(clean)) return false;
            const lower = clean.toLowerCase();
            const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());

            if (players.length >= 2) {
                const killer = players[0];
                const victim = players[players.length - 1];
                if (killer === victim) return this.recordDeath(victim);
                return this.recordKill(killer, victim);
            }
            if (players.length === 1) {
                // One known player + a self-death phrase => elimination only.
                if (this.selfDeathPhrases.some(p => lower.includes(p))) {
                    return this.recordDeath(players[0]);
                }
            }
            return false;
        }

        recordKillPointOnly(killerName) {
            const killerTeam = this.state.findPlayerTeam(killerName);
            if (!killerTeam) return false;
            const ks = this.state.getOrCreatePlayerStats(killerName, killerTeam);
            ks.kills++;
            this.engine.awardPoints(killerTeam, 'Kill');
            this.state.ensureScore(killerTeam).kills.push({
                player: killerName, victim: '?', time: new Date().toISOString()
            });
            this.state.addLog(`${killerName} got a kill`, 'success');
            return 'kill';
        }

        recordKill(killerName, victimName) {
            const killerTeam = this.state.findPlayerTeam(killerName);
            const victimTeam = this.state.findPlayerTeam(victimName);
            if (killerTeam) {
                const ks = this.state.getOrCreatePlayerStats(killerName, killerTeam);
                ks.kills++;
                this.engine.awardPoints(killerTeam, 'Kill');
                this.state.ensureScore(killerTeam).kills.push({
                    player: killerName, victim: victimName, time: new Date().toISOString()
                });
            }
            if (victimTeam) {
                const vs = this.state.getOrCreatePlayerStats(victimName, victimTeam);
                vs.deaths++;
                this.markEliminated(victimName, victimTeam);
            }
            this.state.addLog(`${killerName} eliminated ${victimName}`, 'success');
            return 'kill';
        }

        recordDeath(victimName) {
            const team = this.state.findPlayerTeam(victimName);
            if (!team) return false;
            const vs = this.state.getOrCreatePlayerStats(victimName, team);
            vs.deaths++;
            this.markEliminated(victimName, team);
            this.state.addLog(`${victimName} was eliminated`, 'warning');
            return 'death';
        }

        markEliminated(playerName, teamName) {
            const ps = this.state.getOrCreatePlayerStats(playerName, teamName);
            if (!ps.eliminated) {
                ps.eliminated = true;
                if (!this.state.playerEliminationOrder.includes(playerName)) {
                    this.state.playerEliminationOrder.push(playerName);
                }
            }
        }

        /**
         * Team elimination: "[COLOR] Team has been ELIMINATED" / "...eliminated!".
         * Resolution order:
         *   1) Exact app-team name / color-word match via resolveTeamFromLabel.
         *   2) Structural fallback: the app team that has the most newly-eliminated
         *      players and hasn't been placed yet (handles color mismatches like
         *      "Lime Team" when the app team is called "YELLOW").
         * Returns true if handled.
         */
        detectTeamElimination(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?has been (?:ELIMINATED|eliminated)!?$/i);
            if (!m) return false;
            const label = m[1].trim();
            let teamName = this.resolveTeamFromLabel(label);

            if (teamName) {
                // Validate: if the name-matched team has zero eliminated players but
                // another unresolved team has all its players eliminated, the in-game
                // color is different from the app team name — use structural inference.
                const matched = this.state.teams[teamName];
                const matchedElim = matched ? (matched.players || []).filter(p => {
                    const ps = this.state.playerStats[p];
                    return ps && ps.eliminated;
                }).length : 0;
                const inferred = this._inferEliminatedTeam();
                // If the structurally inferred team has more eliminated players than
                // the name-matched team, trust the player data over the color name.
                if (inferred && inferred !== teamName) {
                    const inf = this.state.teams[inferred];
                    const infElim = inf ? (inf.players || []).filter(p => {
                        const ps = this.state.playerStats[p];
                        return ps && ps.eliminated;
                    }).length : 0;
                    if (infElim > matchedElim) teamName = inferred;
                }
            } else {
                // No name match: fall back to structural inference.
                teamName = this._inferEliminatedTeam();
            }
            if (!teamName) return false;
            // If the resolved team is already eliminated, check if this is a color
            // mismatch (in-game "Red Team" ≠ app RED) or a duplicate message.
            // Use structural inference only when there are unresolved teams AND
            // the inferred team has players actually eliminated (vs. 0 = genuine dup).
            if (this.state.eliminationOrder.includes(teamName)) {
                const inferred = this._inferEliminatedTeam();
                if (!inferred) return true; // all teams resolved, genuine duplicate
                const inf = this.state.teams[inferred];
                const infElim = inf ? (inf.players || []).filter(p => {
                    const ps = this.state.playerStats[p];
                    return ps && ps.eliminated;
                }).length : 0;
                if (infElim === 0) return true; // no players eliminated on unresolved teams, genuine dup
                teamName = inferred;
            }

            this.state.eliminationOrder.push(teamName);
            const team = this.state.teams[teamName];
            if (team && team.players) {
                for (const p of team.players) this.markEliminated(p, teamName);
            }
            this.state.addLog(`${teamName} eliminated (${this.state.eliminationOrder.length} out)`, 'warning');
            this.engine.recordTeamEliminationPlacement(teamName);
            this.engine.tryFinalize();
            return true;
        }

        /**
         * Find the app team that is most likely the one just eliminated:
         * the unresolved team with the most players already marked eliminated,
         * among teams not already in eliminationOrder.
         */
        _inferEliminatedTeam() {
            const unresolved = Object.keys(this.state.teams)
                .filter(t => !this.state.eliminationOrder.includes(t));
            if (unresolved.length === 0) return null;
            // Score by number of eliminated players on each unresolved team.
            let best = null, bestCount = -1;
            for (const t of unresolved) {
                const players = this.state.teams[t].players || [];
                const count = players.filter(p => {
                    const ps = this.state.playerStats[p];
                    return ps && ps.eliminated;
                }).length;
                if (count > bestCount) { bestCount = count; best = t; }
            }
            return best;
        }

        /**
         * Winner: "[COLOR] Team are the WINNERS / are the champions / is the WINNER".
         * Falls back to the last remaining uneliminated team when the label doesn't
         * match any app team name (e.g. "Lime Team" when app teams are RED/BLUE/…).
         */
        detectWinner(clean) {
            const m = clean.match(/(.+?)\s+(?:Team\s+)?(?:is the WINNER|are the WINNERS|are the champions?|is the champion)!?$/i);
            if (!m) return false;
            let teamName = this.resolveTeamFromLabel(m[1].trim());

            // Structural fallback: if the name-resolved team is already eliminated
            // (color mismatch: in-game "Blue Team" ≠ app team BLUE), or no match,
            // use the last active team.
            if (!teamName || this.state.eliminationOrder.includes(teamName)) {
                const active = this.engine.getActiveTeams();
                if (active.length === 1) teamName = active[0];
                else if (active.length === 0) teamName = null; // already finalized
            }
            if (!teamName) return false;
            if (!this.engine.hasPlacement(teamName, '1st place')) {
                this.engine.awardPoints(teamName, '1st place');
            }
            this.state.addLog(`${teamName} WON!`, 'success');
            this.engine.finalizeGamePlacements(teamName);
            return true;
        }

        /**
         * Map an in-game team label to a manually-assigned app team.
         * 1) Exact app-team name match (e.g. "RED" -> team "RED").
         * 2) The label's leading color word ("Red Team" -> "RED").
         * Returns null when no app team corresponds (so District labels with no
         * player overlap are ignored by name and handled via player membership).
         */
        resolveTeamFromLabel(label) {
            const upper = label.trim().toUpperCase();
            if (this.state.teams[upper]) return upper;
            // Try the first word ("Red", "Dark Gray").
            const word = upper.replace(/\bTEAM\b/i, '').trim();
            if (this.state.teams[word]) return word;
            // Two-word colors like "DARK GRAY".
            for (const teamName of Object.keys(this.state.teams)) {
                if (word === teamName || word.startsWith(teamName + ' ') || word.endsWith(' ' + teamName)) {
                    return teamName;
                }
            }
            return null;
        }

        /**
         * Individual placement line. Default matches DeathRun-style:
         *   "You finished in 1st place"
         *   "SamsungWaffle has finished in 2nd place"
         *   "1st Place: Qv19v"
         * Subclasses can override `placementRegexes()` to add mode-specific phrasing.
         */
        detectIndividualPlacement(clean) {
            for (const re of this.placementRegexes()) {
                const m = clean.match(re.pattern);
                if (!m) continue;
                const playerName = this.resolvePlayerName(m[re.name]);
                const position = parseInt(m[re.pos], 10);
                if (!playerName || !Number.isInteger(position)) continue;
                this.recordIndividualPlacement(playerName, position);
                return true;
            }
            return false;
        }

        placementRegexes() {
            return [
                { pattern: /(?:»\s*)?(You|[A-Za-z0-9_ ]+?)\s+(?:has\s+)?finished in\s+(\d+)(?:st|nd|rd|th)\s+place/i, name: 1, pos: 2 },
                { pattern: /(?:»\s*)?(\d+)(?:st|nd|rd|th)\s+Place:\s+([A-Za-z0-9_ ]+?)(?:\s|$|\[)/i, name: 2, pos: 1 }
            ];
        }

        recordIndividualPlacement(playerName, position) {
            const team = this.state.findPlayerTeam(playerName);
            if (!team) return false;
            const ps = this.state.getOrCreatePlayerStats(playerName, team);
            ps.placement = ChatUtils.ordinal(position);

            const key = this.engine.placementKey(position);
            if (key) {
                const score = this.state.ensureScore(team);
                const already = score.placements.some(p => p.player === playerName && p.position === position);
                if (!already) {
                    this.engine.awardPoints(team, key);
                    score.placements.push({ player: playerName, position, time: new Date().toISOString() });
                }
            }
            this.state.addLog(`${team} - ${playerName} finished ${ChatUtils.ordinal(position)}`, 'info');

            // Team-finish bonus tracking (DeathRun / Gravity).
            if (this.features.teamFinish) this.trackTeamFinish(team, playerName);
            return true;
        }

        trackTeamFinish(teamName, playerName) {
            if (!this.state.playersFinished[teamName]) this.state.playersFinished[teamName] = [];
            if (!this.state.playersFinished[teamName].includes(playerName)) {
                this.state.playersFinished[teamName].push(playerName);
            }
            const team = this.state.teams[teamName];
            if (!team || !team.players) return;
            const allFinished = team.players.every(p => this.state.playersFinished[teamName].includes(p));
            if (allFinished && !this.state.teamsFullyFinished.includes(teamName)) {
                this.state.teamsFullyFinished.push(teamName);
                if (this.state.teamsFullyFinished.length === 1) {
                    this.engine.awardPoints(teamName, 'First full team finish');
                    this.state.addLog(`${teamName} is the FIRST team to fully finish!`, 'success');
                }
            }
        }

        /** Resolve "You" to the configured local IGN (or null if unset). */
        resolvePlayerName(raw) {
            if (!raw) return null;
            const name = raw.trim();
            if (/^you$/i.test(name)) {
                const ign = (this.points.myIgn || '').trim();
                if (!ign) {
                    this.state.addLog('Skipped a "You" event - set "My IGN" in Settings to score it', 'warning');
                    return null;
                }
                return ign;
            }
            return name;
        }
    }

    global.Hive = global.Hive || {};
    global.Hive.parsers = global.Hive.parsers || {};
    global.Hive.parsers.GamemodeParser = GamemodeParser;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GamemodeParser;
    }
})(typeof window !== 'undefined' ? window : globalThis);
