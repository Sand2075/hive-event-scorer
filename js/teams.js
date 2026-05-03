// Hive Event Scorer - Team Management (Predefined Teams)

class TeamManager {
    constructor() {
        // Predefined teams with color codes
        this.predefinedTeams = {
            'YELLOW': { color: '#FFFF55', colorCode: 'e', players: [] },
            'LIME': { color: '#55FF55', colorCode: 'a', players: [] },
            'RED': { color: '#FF5555', colorCode: 'c', players: [] },
            'BLUE': { color: '#5555FF', colorCode: '9', players: [] },
            'GOLD': { color: '#FFAA00', colorCode: '6', players: [] },
            'MAGENTA': { color: '#FF55FF', colorCode: 'd', players: [] },
            'AQUA': { color: '#55FFFF', colorCode: 'b', players: [] },
            'GRAY': { color: '#AAAAAA', colorCode: '7', players: [] },
            'PURPLE': { color: '#AA00AA', colorCode: '5', players: [] },
            'GREEN': { color: '#00AA00', colorCode: '2', players: [] },
            'DARK GRAY': { color: '#555555', colorCode: '8', players: [] },
            'CYAN': { color: '#00AAAA', colorCode: '3', players: [] }
        };

        this.teams = {}; // Actual teams with players

        this.init();
    }

    init() {
        this.loadData();
        this.setupEventListeners();
        this.render();
    }

    setupEventListeners() {
        // Add player
        document.getElementById('addPlayer').addEventListener('click', () => {
            this.addPlayer();
        });

        // Press Enter in player name field
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addPlayer();
            }
        });

        // Clear all players
        document.getElementById('clearAllPlayers').addEventListener('click', () => {
            if (confirm('Remove all players from all teams?')) {
                this.teams = {};
                this.saveData();
                this.render();
            }
        });

        // Back to scorer
        document.getElementById('backToScorer').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Save teams
        document.getElementById('saveTeams').addEventListener('click', () => {
            this.saveData();
            alert('Teams saved successfully!');
        });
    }

    addPlayer() {
        const playerName = document.getElementById('playerName').value.trim();
        const teamName = document.getElementById('teamSelect').value;

        if (!playerName) {
            alert('Please enter a player name!');
            return;
        }

        if (!teamName) {
            alert('Please select a team!');
            return;
        }

        // Remove player from any existing team
        this.removePlayerFromAllTeams(playerName);

        // Add player to selected team
        if (!this.teams[teamName]) {
            this.teams[teamName] = {
                color: this.predefinedTeams[teamName].color,
                colorCode: this.predefinedTeams[teamName].colorCode,
                players: []
            };
        }

        if (!this.teams[teamName].players.includes(playerName)) {
            this.teams[teamName].players.push(playerName);
        }

        // Clear input
        document.getElementById('playerName').value = '';

        this.saveData();
        this.render();
    }

    removePlayerFromAllTeams(playerName) {
        for (const teamName in this.teams) {
            const index = this.teams[teamName].players.indexOf(playerName);
            if (index > -1) {
                this.teams[teamName].players.splice(index, 1);

                // Remove team if empty
                if (this.teams[teamName].players.length === 0) {
                    delete this.teams[teamName];
                }
            }
        }
    }

    removePlayer(teamName, playerName) {
        if (!this.teams[teamName]) return;

        const index = this.teams[teamName].players.indexOf(playerName);
        if (index > -1) {
            this.teams[teamName].players.splice(index, 1);
        }

        // Remove team if empty
        if (this.teams[teamName].players.length === 0) {
            delete this.teams[teamName];
        }

        this.saveData();
        this.render();
    }

    render() {
        const teamsGrid = document.getElementById('teamsGrid');

        if (Object.keys(this.teams).length === 0) {
            teamsGrid.innerHTML = `
                <div class="teams-empty-state">
                    <h3>No players assigned yet</h3>
                    <p>Add players to teams using the form above!</p>
                </div>
            `;
            return;
        }

        // Sort teams by name
        const sortedTeams = Object.entries(this.teams).sort((a, b) => a[0].localeCompare(b[0]));

        let html = '';
        for (const [teamName, teamData] of sortedTeams) {
            html += `
                <div class="team-card" style="border-left: 4px solid ${teamData.color}">
                    <div class="team-card-header">
                        <div class="team-card-name" style="color: ${teamData.color}">
                            ${teamName}
                        </div>
                        <span class="team-color-code">${teamData.colorCode}</span>
                    </div>
                    <div class="team-card-players">
                        ${this.renderPlayerList(teamName, teamData.players)}
                    </div>
                    <div class="team-card-stats">
                        ${teamData.players.length} player${teamData.players.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `;
        }

        teamsGrid.innerHTML = html;

        // Attach remove player event listeners
        document.querySelectorAll('.remove-player-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const teamName = e.target.dataset.team;
                const playerName = e.target.dataset.player;
                this.removePlayer(teamName, playerName);
            });
        });
    }

    renderPlayerList(teamName, players) {
        if (players.length === 0) {
            return '<p class="no-players">No players</p>';
        }

        let html = '<div class="player-list">';
        for (const player of players) {
            html += `
                <div class="player-item">
                    <span class="player-name">${this.escapeHtml(player)}</span>
                    <button class="remove-player-btn" data-team="${teamName}" data-player="${this.escapeHtml(player)}" title="Remove player">×</button>
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    loadData() {
        const saved = localStorage.getItem('hive_teams');
        if (saved) {
            try {
                this.teams = JSON.parse(saved);
            } catch (error) {
                console.error('Error loading teams:', error);
            }
        }
    }

    saveData() {
        localStorage.setItem('hive_teams', JSON.stringify(this.teams));
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.teamManager = new TeamManager();
});
