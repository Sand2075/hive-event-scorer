/**
 * ScoringEngine - shared scoring logic that sits between GameState and the
 * per-gamemode parsers. It owns:
 *  - awarding points to teams (single place that mutates score totals + events)
 *  - team / player placement recording and finalisation
 *  - player point-contribution math (used by stats renderers)
 *  - routing a chat line to the active gamemode parser
 *
 * Parsers call back into the engine for award/placement so the rules live in one
 * place; the engine never reaches into the DOM.
 */
(function (global) {
    'use strict';

    const PLACEMENT_KEYS = {
        1: '1st place',
        2: '2nd place',
        3: '3rd place',
        4: '4th place',
        5: '5th place',
        6: '6th place',
        7: '7th place',
        8: '8th place',
        9: '9th place',
        10: '10th place',
        11: '11th place',
        12: '12th place',
        13: '13th place',
        14: '14th place',
        15: '15th place'
    };
    // Catch-all bucket for unrostered players (e.g. the host who is only there to
    // capture the log). It never earns points and its players are excluded from every
    // placement / point calculation until they are reassigned to a real team.
    const UNKNOWN_TEAM = 'UNKNOWN';

    class ScoringEngine {
        constructor(state, pointSystem) {
            this.state = state;
            this.points = pointSystem;
            this.parsers = {}; // gamemode -> parser instance
        }

        registerParser(gamemode, parser) {
            this.parsers[gamemode] = parser;
        }

        parserFor(gamemode) {
            if (this.parsers[gamemode]) return this.parsers[gamemode];
            const norm = String(gamemode || '').replace(/\s+/g, '').toLowerCase();
            for (const [name, parser] of Object.entries(this.parsers)) {
                if (name.replace(/\s+/g, '').toLowerCase() === norm) return parser;
            }
            return null;
        }

        placementKey(position) {
            return PLACEMENT_KEYS[position] || null;
        }

        /** True for a team that should accrue points (i.e. any real team, not UNKNOWN). */
        isScorableTeam(teamName) {
            return !!teamName && teamName !== UNKNOWN_TEAM;
        }

        /** True for a player currently on a real (scorable) team. */
        isScorablePlayer(playerName) {
            return this.isScorableTeam(this.state.findPlayerTeam(playerName));
        }

        /** Award points for an event type to a team, recording it in the events log. */
        awardPoints(teamName, eventType) {
            if (!this.isScorableTeam(teamName)) return 0; // UNKNOWN team never scores
            const table = this.points.forGamemode(this.state.gamemode);
            if (!table) return 0;
            const pts = table[eventType];
            if (pts === undefined) return 0;

            const score = this.state.ensureScore(teamName);
            score.score += pts;
            score.events.push({ type: eventType, points: pts, time: new Date().toISOString() });
            return pts;
        }

        hasPlacement(teamName, placementKey) {
            const s = this.state.scores[teamName];
            return !!(s && s.events.some(e => e.type === placementKey));
        }

        getActiveTeams() {
            return Object.keys(this.state.teams).filter(t => !this.state.eliminationOrder.includes(t));
        }

        /** Number of players on a team that are still alive (not eliminated). */
        aliveCount(teamName) {
            const team = this.state.teams[teamName];
            if (!team || !team.players) return 0;
            return team.players.filter(p => {
                const ps = this.state.playerStats[p];
                return !ps || !ps.eliminated;
            }).length;
        }

        /** True when every player on a team has been eliminated (team is knocked out). */
        isTeamFullyEliminated(teamName) {
            const team = this.state.teams[teamName];
            if (!team || !team.players || team.players.length === 0) return false;
            return team.players.every(p => {
                const ps = this.state.playerStats[p];
                return ps && ps.eliminated;
            });
        }

        // ---- team placements ---------------------------------------------
        recordTeamPlacement(teamName, position) {
            const key = this.placementKey(position);
            if (key && !this.hasPlacement(teamName, key)) {
                this.awardPoints(teamName, key);
            }
            const team = this.state.teams[teamName];
            if (team && team.players) {
                const ord = global.Hive.ChatUtils.ordinal(position);
                for (const p of team.players) {
                    const ps = this.state.getOrCreatePlayerStats(p, teamName);
                    if (!ps.placement) ps.placement = ord;
                }
            }
        }

        /** Record placement for a team being eliminated, derived from elimination order. */
        recordTeamEliminationPlacement(teamName) {
            const totalTeams = Object.keys(this.state.teams).length;
            const position = totalTeams - this.state.eliminationOrder.indexOf(teamName);
            this.recordTeamPlacement(teamName, position);
        }

        /** If only one team remains active, finalise the whole game with it as winner. */
        tryFinalize() {
            const active = this.getActiveTeams();
            if (active.length === 1) this.finalizeGamePlacements(active[0]);
        }

        /**
         * Finalise a team-elimination game purely from survival state - the team(s)
         * with players still alive win, NOT the team with the most points. Used on
         * "Game OVER" to close out any teams that weren't explicitly eliminated.
         * No-op once every team is already placed.
         */
        finalizeFromSurvival() {
            const active = this.getActiveTeams();
            if (active.length === 0) return;          // already fully placed
            if (active.length === 1) { this.finalizeGamePlacements(active[0]); return; }
            // More than one team still "active" means some knock-outs weren't detected.
            // Survival decides it: the team with the most players still alive wins.
            const winner = active.slice().sort((a, b) =>
                this.aliveCount(b) - this.aliveCount(a) || a.localeCompare(b))[0];
            this.finalizeGamePlacements(winner);
        }

        finalizeGamePlacements(winnerTeam) {
            const totalTeams = Object.keys(this.state.teams).length;
            if (winnerTeam && !this.hasPlacement(winnerTeam, '1st place')) {
                this.recordTeamPlacement(winnerTeam, 1);
            }
            for (let i = 0; i < this.state.eliminationOrder.length; i++) {
                this.recordTeamPlacement(this.state.eliminationOrder[i], totalTeams - i);
            }
            for (const teamName of Object.keys(this.state.teams)) {
                if (teamName !== winnerTeam && !this.state.eliminationOrder.includes(teamName)) {
                    this.recordTeamPlacement(teamName, 2);
                }
            }
            this.state.currentGameCompleted = true;
        }

        // ---- player placements (individual-survival modes) ---------------
        recordPlayerPlacement(teamName, playerName, position) {
            const ps = this.state.getOrCreatePlayerStats(playerName, teamName);
            ps.placement = global.Hive.ChatUtils.ordinal(position);
            const key = this.placementKey(position);
            if (!key) return;
            const score = this.state.ensureScore(teamName);
            const already = score.placements.some(p => p.player === playerName);
            if (!already) {
                this.awardPoints(teamName, key);
                score.placements.push({ player: playerName, position, time: new Date().toISOString() });
            }
        }

        /**
         * Assign placements to every player from elimination order: first eliminated
         * gets last place; survivors fill the top slots. Used by all individual-survival
         * modes. UNKNOWN players (e.g. the logging host) are excluded entirely, so they
         * neither score nor occupy a placement slot that would shift real players down.
         */
        finalizePlayerPlacements() {
            const players = this.state.allPlayerNames().filter(n => this.isScorablePlayer(n));
            const totalPlayers = players.length;
            if (totalPlayers === 0) return;

            const assigned = new Set();
            const finalPositions = [];

            const order = this.state.playerEliminationOrder.filter(n => this.isScorablePlayer(n));

            for (let i = 0; i < order.length; i++) {
                const name = order[i];
                const team = this.state.findPlayerTeam(name);
                const pos = totalPlayers - i;

                this.recordPlayerPlacement(team, name, pos);
                finalPositions.push({ player: name, team, position: pos });
                assigned.add(name);
            }

            // Survivors take the remaining best positions.
            const survivors = players
                .filter(n => !assigned.has(n))
                .sort((a, b) => a.localeCompare(b));

            for (let i = 0; i < survivors.length; i++) {
                const name = survivors[i];
                const team = this.state.findPlayerTeam(name);
                const pos = survivors.length - i;

                this.recordPlayerPlacement(team, name, pos);
                finalPositions.push({ player: name, team, position: pos });
            }

            // Rank teams by their best-finishing player.
            // Lowest player placement number = team survived the longest.
            const bestPlacementByTeam = {};

            for (const result of finalPositions) {
                if (!this.isScorableTeam(result.team)) continue;

                if (
                    bestPlacementByTeam[result.team] === undefined ||
                    result.position < bestPlacementByTeam[result.team]
                ) {
                    bestPlacementByTeam[result.team] = result.position;
                }
            }

            const teamSurvivalRanking = Object.entries(bestPlacementByTeam)
                .sort((a, b) => a[1] - b[1])
                .map(([teamName]) => teamName);

            const teamBonusEvents = [
                'Last team standing',
                'Second last team standing',
                'Third last team standing'
            ];

            for (let i = 0; i < Math.min(3, teamSurvivalRanking.length); i++) {
                const teamName = teamSurvivalRanking[i];
                const eventType = teamBonusEvents[i];

                if (!this.hasPlacement(teamName, eventType)) {
                    this.awardPoints(teamName, eventType);
                }
            }

            this.state.currentGameCompleted = true;
        }

        /**
         * Rebuild the current game's team scores from the per-player event records after a
         * roster change, so points follow players to their new team. Player-tagged data
         * (kills, bed breaks, elimination / finish order) is the source of truth; UNKNOWN
         * players are excluded from all scoring. Safe to call any time there are scores.
         */
        recomputeScores() {
            const features = this.points.featuresFor(this.state.gamemode) || {};
            // Snapshot player-tagged records from the existing (possibly stale) scores.
            const kills = [], beds = [], finishPlacements = [];
            for (const s of Object.values(this.state.scores)) {
                if (Array.isArray(s.kills)) kills.push(...s.kills);
                if (Array.isArray(s.bedBreaks)) beds.push(...s.bedBreaks);
                if (Array.isArray(s.placements)) finishPlacements.push(...s.placements);
            }
            // Reset and re-create a bucket for every current team.
            this.state.scores = {};
            for (const t of Object.keys(this.state.teams)) this.state.ensureScore(t);

            for (const k of kills) {
                const t = this.state.findPlayerTeam(k.player);
                if (!this.isScorableTeam(t)) continue;
                this.state.ensureScore(t).kills.push(k);
                this.awardPoints(t, 'Kill');
            }
            for (const b of beds) {
                const t = this.state.findPlayerTeam(b.player);
                if (!this.isScorableTeam(t)) continue;
                this.state.ensureScore(t).bedBreaks.push(b);
                this.awardPoints(t, 'Bed Break');
            }

            // Placements: survival modes re-rank from the player-keyed elimination order
            // (so a player leaving/joining UNKNOWN shifts the ranking); finish modes keep
            // each player's absolute position from the log.
            if (features.individualSurvival) {
                this.finalizePlayerPlacements();
            } else if (features.individualFinish) {
                for (const p of finishPlacements) {
                    const t = this.state.findPlayerTeam(p.player);
                    if (!this.isScorableTeam(t)) continue;
                    this.state.ensureScore(t).placements.push(p);
                    const key = this.placementKey(Number(p.position));
                    if (key) this.awardPoints(t, key);
                }
                if (features.teamFinish) this._recomputeTeamFinishes(finishPlacements);
            }
        }

        /**
         * Re-derive the "First full team finish" bonus from finish positions: among teams
         * whose every current member finished, the one whose last member finished earliest
         * (smallest worst position) gets the single +1.
         */
        _recomputeTeamFinishes(finishPlacements) {
            const posOf = {};

            for (const p of finishPlacements) {
                posOf[p.player] = Number(p.position);
            }

            const completedTeams = [];

            for (const [teamName, team] of Object.entries(this.state.teams)) {
                if (!this.isScorableTeam(teamName)) continue;

                const members = team.players || [];

                if (
                    members.length === 0 ||
                    members.some(member => posOf[member] === undefined)
                ) {
                    continue;
                }

                const completionPosition = Math.max(
                    ...members.map(member => posOf[member])
                );

                completedTeams.push({
                    teamName,
                    completionPosition
                });
            }

            completedTeams.sort((a, b) =>
                a.completionPosition - b.completionPosition ||
                a.teamName.localeCompare(b.teamName)
            );

            const bonusEvents = [
                'First full team finish',
                'Second full team finish',
                'Third full team finish'
            ];

            for (let i = 0; i < Math.min(3, completedTeams.length); i++) {
                this.awardPoints(completedTeams[i].teamName, bonusEvents[i]);
            }
        }

        // ---- contribution math (for stats display) -----------------------
        playerContribution(teamScore, playerName, playerData, pointSystemTable, features) {
            if (!teamScore) return 0;
            const table = pointSystemTable || {};
            const killPts = Number(table['Kill'] || 0);
            const bedPts = Number(table['Bed Break'] || 0);
            let total = 0;

            if (Array.isArray(teamScore.kills)) {
                total += teamScore.kills.filter(e => e.player === playerName).length * killPts;
            }
            if (Array.isArray(teamScore.bedBreaks)) {
                total += teamScore.bedBreaks.filter(e => e.player === playerName).length * bedPts;
            }

            const killLeaderPts = Number(table['Kill Leader'] || 0);

            if (Array.isArray(teamScore.events)) {
                total += teamScore.events.filter(event =>
                    event.type === 'Kill Leader' &&
                    event.player === playerName
                ).length * killLeaderPts;
            }

            if (features && (features.individualFinish || features.individualSurvival)) {
                let hasPlacementRecord = false;

                if (Array.isArray(teamScore.placements)) {
                    for (const pl of teamScore.placements) {
                        if (pl.player !== playerName) continue;

                        hasPlacementRecord = true;

                        const key = this.placementKey(Number(pl.position));

                        if (key && table[key] !== undefined) {
                            total += Number(table[key]);
                        }
                    }
                }

                if (!hasPlacementRecord && playerData && playerData.placement) {
                    const m = String(playerData.placement).match(/\d+/);

                    if (m) {
                        const key = this.placementKey(Number(m[0]));

                        if (key && table[key] !== undefined) {
                            total += Number(table[key]);
                        }
                    }
                }
            }
            return total;
        }

        currentPlayerContribution(playerName, playerData) {
            if (!playerData || !playerData.team) return 0;

            const teamScore = this.state.scores[playerData.team];
            const table = this.points.forGamemode(this.state.gamemode) || {};
            const features = this.points.featuresFor(this.state.gamemode) || {};

            return this.playerContribution(
                teamScore,
                playerName,
                playerData,
                table,
                features
            );
        }

        gamePlayerContribution(game, playerName, playerData) {
            if (!game || !playerData || !playerData.team || !game.scores) return 0;

            const teamScore = game.scores[playerData.team];
            const table = this.points.forGamemode(game.gamemode) || {};
            const features = this.points.featuresFor(game.gamemode) || {};

            return this.playerContribution(
                teamScore,
                playerName,
                playerData,
                table,
                features
            );
        }
    }

    ScoringEngine.PLACEMENT_KEYS = PLACEMENT_KEYS;

    global.Hive = global.Hive || {};
    global.Hive.ScoringEngine = ScoringEngine;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ScoringEngine;
    }
})(typeof window !== 'undefined' ? window : globalThis);
