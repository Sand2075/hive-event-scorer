/**
 * TeamsRenderer - the Teams tab: the grid of team cards, per-player remove button,
 * and the per-player team-change dropdown. Mutations are delegated back to the app
 * controller (which owns undo/persistence).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class TeamsRenderer extends Base {
        render() {
            const grid = this.$('teamsGrid');
            if (!grid) return;

            if (Object.keys(this.state.teams).length === 0) {
                grid.innerHTML = `
                    <div class="teams-empty-state">
                        <h3>No players assigned yet</h3>
                        <p>Add players to teams using the form above!</p>
                    </div>`;
                return;
            }

            const sorted = Object.entries(this.state.teams).sort((a, b) => a[0].localeCompare(b[0]));
            grid.innerHTML = sorted.map(([teamName, data]) => `
                <div class="team-card" style="border-left: 4px solid ${data.color}">
                    <div class="team-card-header">
                        <div class="team-card-name" style="color: ${data.color}">${this.escapeHtml(teamName)}</div>
                        <span class="team-color-code">${data.colorCode}</span>
                    </div>
                    <div class="team-card-players">${this.renderPlayerList(teamName, data.players)}</div>
                    <div class="team-card-stats">${data.players.length} player${data.players.length !== 1 ? 's' : ''}</div>
                </div>`).join('');

            this.attachListeners();
        }

        renderPlayerList(teamName, players) {
            if (!players || players.length === 0) return '<p class="no-players">No players</p>';
            return '<div class="player-list">' + players.map(player => {
                const options = Object.keys(this.state.predefinedTeams).map(t =>
                    `<option value="${t}" ${t === teamName ? 'selected' : ''}>${t}</option>`).join('');
                const safe = this.escapeHtml(player);
                return `
                    <div class="player-item">
                        <div class="player-item-left">
                            <span class="player-name">${safe}</span>
                            <select class="change-team-select" data-player="${safe}" data-current-team="${this.escapeHtml(teamName)}">
                                ${options}
                            </select>
                        </div>
                        <button class="remove-player-btn" data-team="${this.escapeHtml(teamName)}" data-player="${safe}" title="Remove player">×</button>
                    </div>`;
            }).join('') + '</div>';
        }

        attachListeners() {
            document.querySelectorAll('.remove-player-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    this.app.removePlayer(e.target.dataset.team, e.target.dataset.player);
                });
            });
            document.querySelectorAll('.change-team-select').forEach(sel => {
                sel.addEventListener('change', e => {
                    const player = e.target.dataset.player;
                    const cur = e.target.dataset.currentTeam;
                    const next = e.target.value;
                    if (cur !== next) this.app.changePlayerTeam(player, cur, next);
                });
            });
        }
    }

    global.Hive.renderers.TeamsRenderer = TeamsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
