/**
 * StatsRenderer - the Statistics tab, redesigned for readability.
 *
 * Layout (top -> bottom):
 *   1. Event standings  - team blocks ranked by total points, each listing its
 *      players' totals. Click a player to open a detail modal.
 *   2. All players      - compact "chips" of every player's total, click-through.
 *   3. Game history      - completed games (with inline score editing).
 *
 * The Statistics tab focuses on cumulative event results; the live current game and
 * point record live on the Scorer tab instead.
 *
 * Aggregation helpers (aggregatePlayerScores / aggregateTeamStandings /
 * playerDetail) are shared by the UI, the player modal, and the PNG poster export.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class StatsRenderer extends Base {
        constructor(app) {
            super(app);
        }

        renderAll() {
            this.renderEventStandings();
            this.renderPlayerTotals();
            this.renderGameHistory();
        }

        teamColor(teamName) { return this.state.teams[teamName]?.color || '#7C3AED'; }

        // ================= aggregation (shared) =================

        /**
         * Per-player totals across all completed games. Team scores are split among
         * the players on that team who appear in the game; the remainder goes to the
         * highest-contributing players so player sums reconcile with team totals.
         * Returns { [player]: { totalPoints, byGamemode: {mode: pts} } }.
         */
        aggregatePlayerScores() {
            const result = {};
            for (const game of this.state.gameHistory) {
                for (const [teamName, teamScore] of Object.entries(game.scores)) {
                    const team = this.state.teams[teamName];
                    if (!team || !team.players) continue;
                    const players = team.players.filter(p => game.playerStats[p]);
                    if (players.length === 0) continue;

                    const base = Math.floor(teamScore.score / players.length);
                    let remainder = teamScore.score - base * players.length;
                    const ranked = players.slice().sort((a, b) =>
                        this.engine.gamePlayerContribution(game, b, game.playerStats[b]) -
                        this.engine.gamePlayerContribution(game, a, game.playerStats[a]));

                    for (const name of ranked) {
                        let pts = base;
                        if (remainder > 0) { pts += 1; remainder--; }
                        if (!result[name]) result[name] = { totalPoints: 0, byGamemode: {} };
                        result[name].totalPoints += pts;
                        result[name].byGamemode[game.gamemode] = (result[name].byGamemode[game.gamemode] || 0) + pts;
                    }
                }
            }
            return result;
        }

        /**
         * Team standings for the whole event: each team's cumulative points (sum of
         * its games) plus its players' totals. Returns an array sorted desc by points.
         */
        aggregateTeamStandings() {
            const playerScores = this.aggregatePlayerScores();
            const teams = {};
            for (const game of this.state.gameHistory) {
                for (const [teamName, teamScore] of Object.entries(game.scores)) {
                    if (!this.state.teams[teamName]) continue;
                    teams[teamName] = (teams[teamName] || 0) + teamScore.score;
                }
            }
            return Object.entries(teams).map(([teamName, points]) => {
                const roster = this.state.teams[teamName]?.players || [];
                const players = roster
                    .map(name => ({ name, points: playerScores[name] ? playerScores[name].totalPoints : 0 }))
                    .sort((a, b) => b.points - a.points);
                return { team: teamName, teamColor: this.teamColor(teamName), points, players };
            }).sort((a, b) => b.points - a.points);
        }

        /** Flat, ranked list of every registered player's total (for chips + PNG). */
        playerStandingsList() {
            const scores = this.aggregatePlayerScores();
            return Object.entries(scores)
                .filter(([name]) => this.state.findPlayerTeam(name))
                .map(([name, data]) => {
                    const team = this.state.findPlayerTeam(name);
                    return { name, team, teamColor: this.teamColor(team), points: data.totalPoints, byGamemode: data.byGamemode };
                })
                .sort((a, b) => b.points - a.points);
        }

        /** Everything needed for the player-detail modal, including per-game placements. */
        playerDetail(name) {
            const team = this.state.findPlayerTeam(name);
            const games = [];
            let totalPoints = 0, totalKills = 0, totalFinalKills = 0, totalBedBreaks = 0, wins = 0;

            for (const game of this.state.gameHistory) {
                const ps = game.playerStats[name];
                if (!ps) continue;
                const pts = this.engine.gamePlayerContribution(game, name, ps);
                totalPoints += pts;
                totalKills += ps.kills || 0;
                totalFinalKills += ps.finalKills || 0;
                totalBedBreaks += ps.bedBreaks || 0;
                if (ps.placement === '1st') wins++;
                games.push({
                    gamemode: game.gamemode,
                    date: game.startTime,
                    points: pts,
                    placement: ps.placement || '-',
                    kills: ps.kills || 0,
                    deaths: ps.deaths || 0,
                    finalKills: ps.finalKills || 0,
                    bedBreaks: ps.bedBreaks || 0,
                    features: this.points.featuresFor(game.gamemode) || {}
                });
            }
            games.sort((a, b) => new Date(b.date) - new Date(a.date));
            return { name, team, teamColor: this.teamColor(team), totalPoints, totalKills, totalFinalKills, totalBedBreaks, wins, games };
        }

        // ================= event standings =================
        renderEventStandings() {
            const host = this.$('eventStandings');
            if (!host) return;
            if (this.state.gameHistory.length === 0) {
                host.innerHTML = '<p class="empty-state">No completed games yet. Finish a game to build the event standings.</p>';
                return;
            }
            const standings = this.aggregateTeamStandings();
            if (standings.length === 0) {
                host.innerHTML = '<p class="empty-state">No team data yet.</p>';
                return;
            }
            host.innerHTML = standings.map((t, i) => `
                <div class="standings-team" style="--team-color:${t.teamColor}">
                    <div class="standings-team-head">
                        <span class="standings-rank">${i === 0 ? '★ 1st' : '#' + (i + 1)}</span>
                        <span class="standings-team-name">${this.escapeHtml(t.team)}</span>
                        <span class="standings-team-total">${t.points} pts</span>
                    </div>
                    <div class="standings-players">
                        ${t.players.map(p => `
                            <div class="standings-player" data-player="${this.escapeHtml(p.name)}">
                                <span class="pname">${this.escapeHtml(p.name)}</span>
                                <span class="ppts">${p.points}</span>
                            </div>`).join('')}
                    </div>
                </div>`).join('');

            this.attachPlayerClicks(host);
        }

        // ================= compact all-players list =================
        renderPlayerTotals() {
            const host = this.$('playerTotals');
            if (!host) return;
            const list = this.playerStandingsList();
            if (list.length === 0) {
                host.innerHTML = '<p class="empty-state">No player totals yet.</p>';
                return;
            }
            host.innerHTML = list.map((p, i) => `
                <div class="player-total-chip" data-player="${this.escapeHtml(p.name)}" style="--team-color:${p.teamColor}">
                    <span class="ptc-rank">#${i + 1}</span>
                    <span class="ptc-name">${this.escapeHtml(p.name)}</span>
                    <span class="ptc-pts">${p.points}</span>
                </div>`).join('');
            this.attachPlayerClicks(host);
        }

        attachPlayerClicks(host) {
            host.querySelectorAll('[data-player]').forEach(el => {
                el.addEventListener('click', () => this.app.openPlayerModal(el.dataset.player));
            });
        }

        // ================= game history =================
        renderGameHistory() {
            const host = this.$('gameHistory');
            if (!host) return;
            if (this.state.gameHistory.length === 0) {
                host.innerHTML = '<p class="empty-state">No completed games yet! Start a new game after playing to save it to history.</p>';
                return;
            }
            host.innerHTML = [...this.state.gameHistory].reverse().map(g => this.renderGameCard(g)).join('');
        }

        renderGameCard(game) {
            const start = new Date(game.startTime);
            const end = new Date(game.endTime);
            const duration = isFinite(end) ? Math.round((end - start) / 60000) : 0;
            const editing = String(this.state.editingGameId) === String(game.id);
            const teams = Object.entries(game.scores).sort((a, b) => b[1].score - a[1].score);
            const winner = teams[0];
            const features = this.points.featuresFor(game.gamemode) || {};
            const showCombat = !!features.kills, showBeds = !!features.bedBreaks;

            return `
                <div class="game-history-card ${editing ? 'editing' : ''}" data-game-id="${game.id}">
                    <div class="game-header">
                        <h3>${this.escapeHtml(game.gamemode)}</h3>
                        <span class="game-date">${start.toLocaleString()}</span>
                    </div>
                    <div class="game-info">
                        <span>Duration: ${duration} min</span>
                        <span>Winner: ${winner ? this.escapeHtml(winner[0]) + ' (' + winner[1].score + ' pts)' : '-'}</span>
                    </div>
                    <div class="game-scores">
                        <div class="game-scores-header">
                            <h4>Team Scores</h4>
                            ${editing ? `
                            <div class="game-score-editor-actions">
                                <button type="button" class="btn btn-success btn-small" data-action="save-game-scores" data-game-id="${game.id}">Save Scores</button>
                                <button type="button" class="btn btn-secondary btn-small" data-action="cancel-game-scores" data-game-id="${game.id}">Cancel</button>
                            </div>` : `
                            <button type="button" class="btn btn-info btn-small" data-action="edit-game-scores" data-game-id="${game.id}">Edit Scores</button>`}
                        </div>
                        ${editing ? '<p class="game-score-editor-help">Adjust the saved score for any team. Totals refresh on save.</p>' : ''}
                        ${teams.map(([teamName, data], i) => {
                            const color = this.teamColor(teamName);
                            return `
                                <div class="score-row" style="border-left: 3px solid ${color}">
                                    <span class="rank">#${i + 1}</span>
                                    <span class="team-name">${this.escapeHtml(teamName)}</span>
                                    ${editing
                                        ? `<input type="number" class="score-editor-input" data-team="${this.escapeHtml(teamName)}" value="${data.score}" min="0" />`
                                        : `<span class="points">${data.score} pts</span>`}
                                </div>`;
                        }).join('')}
                    </div>
                    <div class="game-player-stats">
                        <h4>Player Performance</h4>
                        <div class="player-stats-grid">
                            ${Object.entries(game.playerStats).map(([name, data]) => {
                                const color = this.teamColor(data.team);
                                const c = this.engine.gamePlayerContribution(game, name, data);
                                return `
                                    <div class="player-stat-card mini" style="border-left: 4px solid ${color}">
                                        <strong>${this.escapeHtml(name)}</strong>
                                        <div class="stat-badge" style="background: ${color}">${this.escapeHtml(data.team)}</div>
                                        <div class="mini-stats">
                                            <span>Pts: ${c}</span>
                                            ${data.placement ? `<span>Pl: ${data.placement}</span>` : ''}
                                            ${showCombat ? `<span>K: ${data.kills}</span><span>D: ${data.deaths}</span><span>FK: ${data.finalKills}</span>` : ''}
                                            ${showBeds && data.bedBreaks > 0 ? `<span>BB: ${data.bedBreaks}</span>` : ''}
                                        </div>
                                    </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>`;
        }
    }

    global.Hive.renderers.StatsRenderer = StatsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
