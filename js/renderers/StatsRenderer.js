/**
 * StatsRenderer - the Totals tab (event standings, player totals) and History
 * tab (completed games with inline score editing).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class StatsRenderer extends Base {
        /**
         * Render the whole Totals tab.
         * @returns {void}
         */
        renderAll() {
            this.renderEventStandings();
            this.renderPlayerTotals();
            this.renderGameHistory();
        }

        /**
         * Display color for a team.
         * @param {string} teamName Team name.
         * @returns {string} CSS color.
         */
        teamColor(teamName) { return this.state.teams[teamName]?.color || '#7C3AED'; }

        /**
         * Per-player totals across all completed games; team points are attributed
         * so player sums reconcile with team totals.
         * @returns {Object} Player name to { totalPoints, byGamemode }.
         */
        aggregatePlayerScores() {
            const result = {};

            const add = (name, gamemode, pts) => {
                if (!result[name]) {
                    result[name] = {
                        totalPoints: 0,
                        byGamemode: {}
                    };
                }

                result[name].totalPoints += pts;

                result[name].byGamemode[gamemode] =
                    (result[name].byGamemode[gamemode] || 0) + pts;
            };

            for (const game of this.state.gameHistory) {
                for (const [teamName] of Object.entries(game.scores || {})) {
                    if (teamName === 'UNKNOWN') continue;

                    const team = this.state.teams[teamName];
                    if (!team || !team.players) continue;

                    const players = team.players.filter(
                        player => game.playerStats?.[player]
                    );

                    for (const name of players) {
                        const pts = this.engine.gamePlayerContribution(
                            game,
                            name,
                            game.playerStats[name]
                        );

                        add(name, game.gamemode, pts);
                    }
                }
            }

            return result;
        }

        teamPointBreakdown(teamName) {
            const breakdown = [];
            let total = 0;

            for (const game of this.state.gameHistory) {
                const teamScore = game.scores?.[teamName];
                if (!teamScore) continue;

                const features = this.points.featuresFor(game.gamemode) || {};

                // Only these explicit event types are always team-level bonuses.
                const teamBonusTypes = new Set([
                    'First full team finish',
                    'Second full team finish',
                    'Third full team finish',

                    'Last team standing',
                    'Second last team standing',
                    'Third last team standing'
                ]);

                for (const event of teamScore.events || []) {
                    let isTeamEvent = teamBonusTypes.has(event.type);

                    // Placement points are team points only in team-placement modes.
                    const placementMatch = String(event.type || '').match(
                        /^(\d+)(?:st|nd|rd|th) place$/i
                    );

                    if (
                        placementMatch &&
                        features.teamElimination
                    ) {
                        isTeamEvent = true;
                    }

                    if (!isTeamEvent) continue;

                    const points = Number(event.points || 0);

                    if (points === 0) continue;

                    breakdown.push({
                        gamemode: game.gamemode,
                        reason: event.type,
                        points
                    });

                    total += points;
                }
            }

            return {
                total,
                breakdown
            };
        }

        /**
         * Cumulative team standings with per-player totals.
         * @returns {Array<Object>} Sorted desc by points.
         */
        aggregateTeamStandings() {
            const playerScores = this.aggregatePlayerScores();
            const teams = {};
            for (const game of this.state.gameHistory) {
                for (const [teamName, teamScore] of Object.entries(game.scores)) {
                    if (teamName === 'UNKNOWN' || !this.state.teams[teamName]) continue;
                    teams[teamName] = (teams[teamName] || 0) + teamScore.score;
                }
            }
            return Object.entries(teams).map(([teamName, points]) => {
                const roster = this.state.teams[teamName]?.players || [];
                const players = roster
                    .map(name => ({ name, points: playerScores[name] ? playerScores[name].totalPoints : 0 }))
                    .sort((a, b) => b.points - a.points);
                const teamPointData = this.teamPointBreakdown(teamName);

                const playerPoints = players.reduce(
                    (sum, player) => sum + player.points,
                    0
                );

                const teamPoints = Math.max(
                    0,
                    points - playerPoints
                );

                return {
                    team: teamName,
                    teamColor: this.teamColor(teamName),
                    points,
                    teamPoints,
                    teamPointBreakdown: teamPointData.breakdown,
                    players
                };
            }).sort((a, b) => b.points - a.points);
        }

        /**
         * Ranked list of every rostered player's total.
         * @returns {Array<Object>} Sorted desc by points.
         */
        playerStandingsList() {
            const scores = this.aggregatePlayerScores();
            return Object.entries(scores)
                .filter(([name]) => {
                    const t = this.state.findPlayerTeam(name);
                    return t && t !== 'UNKNOWN';
                })
                .map(([name, data]) => {
                    const team = this.state.findPlayerTeam(name);
                    return { name, team, teamColor: this.teamColor(team), points: data.totalPoints, byGamemode: data.byGamemode };
                })
                .sort((a, b) => b.points - a.points);
        }

        /**
         * Everything needed for the player-detail modal.
         * @param {string} name Player name.
         * @returns {Object} Totals plus per-game rows.
         */
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

        /**
         * Render the event standings section.
         * @returns {void}
         */
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
                        <span class="standings-rank">${i === 0 ? '1st' : '#' + (i + 1)}</span>
                        <span class="standings-team-name">${this.escapeHtml(t.team)}</span>
                        <span class="standings-team-total">${t.points} pts</span>
                    </div>
                    <div class="standings-players">
                        ${t.teamPoints > 0 ? `
                            <div
                                class="standings-player standings-team-points"
                                data-team-points="${this.escapeHtml(t.team)}"
                                tabindex="0"
                                role="button"
                            >
                                <span class="pname">Team Points</span>
                                <span class="ppts">${t.teamPoints}</span>
                            </div>
                        ` : ''}

                        ${t.players.map(p => `
                            <div class="standings-player" data-player="${this.escapeHtml(p.name)}">
                                <span class="pname">${this.escapeHtml(p.name)}</span>
                                <span class="ppts">${p.points}</span>
                            </div>
                        `).join('')}

                    </div>
                </div>`).join('');

            this.attachPlayerClicks(host);
            host.querySelectorAll('[data-team-points]').forEach(el => {
                el.addEventListener('click', () => {
                    const teamName = el.dataset.teamPoints;
                    const team = standings.find(t => t.team === teamName);

                    if (team) {
                        this.openTeamPointsModal(team);
                    }
                });
            });
        }

        openTeamPointsModal(team) {
            if (!team) return;

            const modal = document.getElementById('teamPointsModal');
            const title = document.getElementById('teamPointsModalTitle');
            const body = document.getElementById('teamPointsModalBody');

            if (!modal || !title || !body) return;

            title.textContent =
                `${team.team} — Team Points (${team.teamPoints})`;

            if (!team.teamPointBreakdown?.length) {
                body.innerHTML =
                    '<p class="empty-state">No team-point details available.</p>';

                modal.classList.add('open');
                return;
            }

            body.innerHTML = `
                <div class="team-points-breakdown">
                    ${team.teamPointBreakdown.map(item => `
                        <div class="pd-game">
                            <div class="pd-game-head">
                                <span>
                                    ${this.escapeHtml(item.gamemode)}
                                </span>

                                <span>
                                    +${item.points} pts
                                </span>
                            </div>

                            <div class="pd-game-stats">
                                <span>
                                    ${this.escapeHtml(item.reason)}
                                </span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

            modal.setAttribute('aria-hidden', 'false');
            modal.classList.add('open');
            return;
        }

        /**
         * Render the compact all-players list.
         * @returns {void}
         */
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

        /**
         * Wire player chips to the detail modal.
         * @param {HTMLElement} host Container element.
         * @returns {void}
         */
        attachPlayerClicks(host) {
            host.querySelectorAll('[data-player]').forEach(el => {
                el.addEventListener('click', () => this.app.openPlayerModal(el.dataset.player));
            });
        }

        /**
         * Render the History tab list.
         * @returns {void}
         */
        renderGameHistory() {
            const host = this.$('gameHistory');
            if (!host) return;
            if (this.state.gameHistory.length === 0) {
                host.innerHTML = '<p class="empty-state">No completed games yet! Start a new game after playing to save it to history.</p>';
                return;
            }
            host.innerHTML = [...this.state.gameHistory].reverse().map(g => this.renderGameCard(g)).join('');
        }

        /**
         * Build one game-history card.
         * @param {Object} game History record.
         * @returns {string} HTML.
         */
        renderGameCard(game) {
            const start = new Date(game.startTime);
            const end = new Date(game.endTime);
            const duration = isFinite(end) ? Math.round((end - start) / 60000) : 0;
            const editing = String(this.state.editingGameId) === String(game.id);
            const teams = Object.entries(game.scores)
                .filter(([t]) => t !== 'UNKNOWN')
                .sort((a, b) => b[1].score - a[1].score);
            // Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
            const ranks = [];
            teams.forEach(([, data], i) => {
                ranks[i] = (i > 0 && data.score === teams[i - 1][1].score) ? ranks[i - 1] : i + 1;
            });
            const topScore = teams.length ? teams[0][1].score : null;
            const winners = teams.filter(([, d]) => d.score === topScore);
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
                        <span>${winners.length > 1 ? 'Tied' : 'Winner'}: ${winners.length ? winners.map(([t]) => this.escapeHtml(t)).join(', ') + ' (' + topScore + ' pts)' : '-'}</span>
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
                                    <span class="rank">#${ranks[i]}</span>
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
                            ${Object.entries(game.playerStats).filter(([, data]) => data.team !== 'UNKNOWN').map(([name, data]) => {
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
