// Hive Event Scorer - Statistics & Analytics

class StatisticsManager {
    constructor() {
        this.gameHistory = [];
        this.scores = {};
        this.teams = {};
        this.actionStats = {};
        this.currentFilter = {
            gamemode: 'all',
            team: 'all'
        };

        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.renderAll();
    }

    setupEventListeners() {
        // Back button
        document.getElementById('backToScorer').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Filters
        document.getElementById('filterGamemode').addEventListener('change', (e) => {
            this.currentFilter.gamemode = e.target.value;
            this.renderAll();
        });

        document.getElementById('filterTeam').addEventListener('change', (e) => {
            this.currentFilter.team = e.target.value;
            this.renderAll();
        });

        // Refresh
        document.getElementById('refreshStats').addEventListener('click', () => {
            this.loadData();
            this.renderAll();
        });

        // Export options
        document.getElementById('exportStats').addEventListener('click', () => {
            this.exportStatistics();
        });

        document.getElementById('exportCSV').addEventListener('click', () => {
            this.exportCSV();
        });

        document.getElementById('printStats').addEventListener('click', () => {
            window.print();
        });

        // Clear history
        document.getElementById('clearHistory').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all game history? This cannot be undone!')) {
                this.gameHistory = [];
                localStorage.removeItem('hive_game_history');
                this.loadData();
                this.renderAll();
                alert('History cleared!');
            }
        });
    }

    loadData() {
        // Load game history
        const savedHistory = localStorage.getItem('hive_game_history');
        if (savedHistory) {
            this.gameHistory = JSON.parse(savedHistory);
        }

        // Load current session data
        const savedData = localStorage.getItem('hive_event_data');
        if (savedData) {
            const data = JSON.parse(savedData);
            this.scores = data.scores || {};
            this.actionStats = data.actionStats || {};
        }

        // Load teams
        const savedTeams = localStorage.getItem('hive_teams');
        if (savedTeams) {
            this.teams = JSON.parse(savedTeams);
        }
    }

    renderAll() {
        this.renderOverview();
        this.renderFilters();
        this.renderPlayerStats();
        this.renderActionBreakdown();
        this.renderGameHistory();
    }

    renderOverview() {
        const allPlayers = new Set();
        const totalGames = this.gameHistory.length;
        let totalActions = 0;
        let totalPoints = 0;

        // From history
        this.gameHistory.forEach(game => {
            if (game.scores) {
                Object.keys(game.scores).forEach(player => allPlayers.add(player));
                Object.values(game.scores).forEach(playerData => {
                    totalActions += playerData.actions ? playerData.actions.length : 0;
                    totalPoints += playerData.score || 0;
                });
            }
        });

        // From current session
        Object.keys(this.scores).forEach(player => allPlayers.add(player));
        Object.values(this.scores).forEach(playerData => {
            totalActions += playerData.actions ? playerData.actions.length : 0;
            totalPoints += playerData.score || 0;
        });

        document.getElementById('statsPlayers').textContent = allPlayers.size;
        document.getElementById('statsGames').textContent = totalGames;
        document.getElementById('statsActions').textContent = totalActions;
        document.getElementById('statsPoints').textContent = totalPoints;
    }

    renderFilters() {
        // Gamemode filter
        const gamemodes = new Set();
        this.gameHistory.forEach(game => {
            if (game.gamemode) gamemodes.add(game.gamemode);
        });

        const gamemodeSelect = document.getElementById('filterGamemode');
        gamemodeSelect.innerHTML = '<option value="all">All Gamemodes</option>' +
            Array.from(gamemodes).map(mode =>
                `<option value="${this.escapeHtml(mode)}">${this.escapeHtml(mode)}</option>`
            ).join('');
        gamemodeSelect.value = this.currentFilter.gamemode;

        // Team filter
        const teamSelect = document.getElementById('filterTeam');
        teamSelect.innerHTML = '<option value="all">All Teams</option>' +
            Object.keys(this.teams).map(team =>
                `<option value="${this.escapeHtml(team)}">${this.escapeHtml(team)}</option>`
            ).join('');
        teamSelect.value = this.currentFilter.team;
    }

    renderPlayerStats() {
        const playerData = this.aggregatePlayerData();
        const tbody = document.getElementById('playerStatsBody');

        if (playerData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center" style="padding: 40px; color: var(--text-muted);">
                        No data available. Start scoring to see statistics!
                    </td>
                </tr>
            `;
            return;
        }

        // Sort by total points
        playerData.sort((a, b) => b.totalPoints - a.totalPoints);

        tbody.innerHTML = playerData.map((player, index) => {
            const avgPoints = player.totalActions > 0 ?
                (player.totalPoints / player.totalActions).toFixed(1) : 0;

            const team = this.getPlayerTeam(player.name);
            const teamBadge = team ?
                `<span class="player-team-badge" style="background: ${team.color};">${this.escapeHtml(team.name)}</span>` :
                '<span style="color: var(--text-muted);">No Team</span>';

            return `
                <tr>
                    <td class="player-rank-cell">#${index + 1}</td>
                    <td class="player-name-cell">${this.escapeHtml(player.name)}</td>
                    <td>${teamBadge}</td>
                    <td class="stat-number">${player.totalPoints}</td>
                    <td class="stat-number">${player.totalActions}</td>
                    <td class="stat-number">${avgPoints}</td>
                    <td class="stat-number">${player.gamesPlayed}</td>
                </tr>
            `;
        }).join('');
    }

    aggregatePlayerData() {
        const players = {};

        // Helper to add player data
        const addPlayerData = (name, score, actions, gameCount = 1) => {
            if (!players[name]) {
                players[name] = {
                    name: name,
                    totalPoints: 0,
                    totalActions: 0,
                    gamesPlayed: 0
                };
            }
            players[name].totalPoints += score;
            players[name].totalActions += actions;
            players[name].gamesPlayed += gameCount;
        };

        // From game history
        this.gameHistory.forEach(game => {
            // Apply filters
            if (this.currentFilter.gamemode !== 'all' && game.gamemode !== this.currentFilter.gamemode) {
                return;
            }

            if (game.scores) {
                Object.entries(game.scores).forEach(([playerName, playerData]) => {
                    if (this.currentFilter.team !== 'all') {
                        const team = this.getPlayerTeam(playerName);
                        if (!team || team.name !== this.currentFilter.team) return;
                    }

                    const score = playerData.score || 0;
                    const actions = playerData.actions ? playerData.actions.length : 0;
                    addPlayerData(playerName, score, actions, 1);
                });
            }
        });

        // From current session (if not in history yet)
        if (this.currentFilter.gamemode === 'all') {
            Object.entries(this.scores).forEach(([playerName, playerData]) => {
                if (this.currentFilter.team !== 'all') {
                    const team = this.getPlayerTeam(playerName);
                    if (!team || team.name !== this.currentFilter.team) return;
                }

                const score = playerData.score || 0;
                const actions = playerData.actions ? playerData.actions.length : 0;
                addPlayerData(playerName, score, actions, 0);
            });
        }

        return Object.values(players);
    }

    renderActionBreakdown() {
        const container = document.getElementById('actionBreakdown');
        const actions = {};

        // Aggregate from history
        this.gameHistory.forEach(game => {
            if (game.actions) {
                Object.entries(game.actions).forEach(([pattern, stats]) => {
                    if (!actions[pattern]) {
                        actions[pattern] = { count: 0, totalPoints: 0 };
                    }
                    actions[pattern].count += stats.count;
                    actions[pattern].totalPoints += stats.totalPoints;
                });
            }
        });

        // From current session
        Object.entries(this.actionStats).forEach(([pattern, stats]) => {
            if (!actions[pattern]) {
                actions[pattern] = { count: 0, totalPoints: 0 };
            }
            actions[pattern].count += stats.count;
            actions[pattern].totalPoints += stats.totalPoints;
        });

        if (Object.keys(actions).length === 0) {
            container.innerHTML = '<p class="empty-state">No actions recorded yet.</p>';
            return;
        }

        // Sort by count
        const sortedActions = Object.entries(actions)
            .sort((a, b) => b[1].count - a[1].count);

        container.innerHTML = sortedActions.map(([pattern, stats]) => `
            <div class="action-card">
                <div class="action-card-header">
                    <span class="action-name">${this.escapeHtml(pattern)}</span>
                    <span class="action-count">${stats.count}</span>
                </div>
                <div class="action-points">${stats.totalPoints > 0 ? '+' : ''}${stats.totalPoints}</div>
                <div class="action-points-label">Total Points</div>
            </div>
        `).join('');
    }

    renderGameHistory() {
        const container = document.getElementById('gameHistory');

        if (this.gameHistory.length === 0) {
            container.innerHTML = '<p class="empty-state">No games recorded yet. Complete a game session to see history!</p>';
            return;
        }

        // Sort by date (newest first)
        const sortedGames = [...this.gameHistory].sort((a, b) =>
            new Date(b.startTime) - new Date(a.startTime)
        );

        container.innerHTML = sortedGames.map((game, index) => {
            const date = new Date(game.startTime).toLocaleString();
            const duration = game.endTime ?
                this.calculateDuration(game.startTime, game.endTime) :
                'Ongoing';

            const scores = game.scores || {};
            const sortedPlayers = Object.entries(scores)
                .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));

            return `
                <div class="game-entry">
                    <div class="game-header">
                        <div>
                            <div class="game-title">Game #${this.gameHistory.length - index}</div>
                            <span class="game-mode">${this.escapeHtml(game.gamemode)}</span>
                        </div>
                        <div class="game-date">${date}</div>
                    </div>
                    <div class="game-scores">
                        ${sortedPlayers.slice(0, 5).map(([player, data]) => `
                            <div class="game-player-score">
                                <span class="game-player-name">${this.escapeHtml(player)}</span>
                                <span class="game-player-points">${data.score || 0} pts</span>
                            </div>
                        `).join('')}
                        ${sortedPlayers.length > 5 ? `
                            <div class="game-player-score">
                                <span class="game-player-name" style="font-style: italic;">+${sortedPlayers.length - 5} more players</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diff = end - start;
        const minutes = Math.floor(diff / 60000);
        return `${minutes} min`;
    }

    getPlayerTeam(playerName) {
        for (const [teamName, teamData] of Object.entries(this.teams)) {
            if (teamData.players && teamData.players.includes(playerName)) {
                return { name: teamName, color: teamData.color };
            }
        }
        return null;
    }

    exportStatistics() {
        const data = {
            overview: {
                totalPlayers: document.getElementById('statsPlayers').textContent,
                totalGames: document.getElementById('statsGames').textContent,
                totalActions: document.getElementById('statsActions').textContent,
                totalPoints: document.getElementById('statsPoints').textContent
            },
            playerData: this.aggregatePlayerData(),
            actionBreakdown: this.actionStats,
            gameHistory: this.gameHistory,
            exportDate: new Date().toISOString()
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        a.download = `hive-statistics-${timestamp}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    exportCSV() {
        const playerData = this.aggregatePlayerData();

        // CSV header
        let csv = 'Rank,Player,Team,Total Points,Total Actions,Avg Points/Action,Games Played\n';

        // CSV rows
        playerData.forEach((player, index) => {
            const team = this.getPlayerTeam(player.name);
            const teamName = team ? team.name : 'No Team';
            const avgPoints = player.totalActions > 0 ?
                (player.totalPoints / player.totalActions).toFixed(1) : 0;

            csv += `${index + 1},"${player.name}","${teamName}",${player.totalPoints},${player.totalActions},${avgPoints},${player.gamesPlayed}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        a.download = `hive-statistics-${timestamp}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize statistics manager
const statsManager = new StatisticsManager();
