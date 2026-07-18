/**
 * SettingsRenderer - the Settings tab: per-gamemode point values, detection-pattern
 * hints (with visibility driven by gamemode features), and the "My IGN" field used
 * to attribute first-person ("You ...") events.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    class SettingsRenderer extends Base {
        selectedGamemode() {
            const sel = this.$('settingsGamemode');
            return sel ? sel.value : '';
        }

        renderPoints() {
            const host = this.$('pointsSettings');
            if (!host) return;
            const mode = this.selectedGamemode();
            const table = this.points.pointSystems[mode];
            if (!table) {
                host.innerHTML = '<p class="empty-state">Invalid gamemode selected</p>';
                return;
            }
            host.innerHTML = `<h3>Point Values for ${this.escapeHtml(mode)}</h3>` +
                Object.entries(table).map(([action, value]) => `
                    <div class="point-item">
                        <label>${this.escapeHtml(action)}</label>
                        <input type="number" data-action="${this.escapeHtml(action)}" value="${value}" min="0" max="100">
                    </div>`).join('');
        }

        renderPatterns() {
            const p = this.points.detectionPatterns || {};
            const set = (id, val) => { const el = this.$(id); if (el) el.value = val || ''; };
            set('patternTeamElim', p.teamElimination);
            set('patternWinner', p.winner);
            set('patternKillPrefix', p.killPrefix);
            set('patternBedBreak', p.bedBreak);
            set('patternIndividualFinish', p.individualFinish);
            const ign = this.$('myIgn');
            if (ign) ign.value = this.points.myIgn || '';
            const autoAdd = this.$('autoAddUnknownPlayers');
            if (autoAdd) autoAdd.checked = this.points.autoAddUnknownPlayers !== false;
            this.updatePatternVisibility();
        }

        updatePatternVisibility() {
            const features = this.points.featuresFor(this.selectedGamemode());
            if (!features) return;
            const toggle = (id, show) => { const el = this.$(id); if (el) el.classList.toggle('hidden', !show); };
            toggle('patternKillGroup', features.kills);
            toggle('patternBedBreakGroup', features.bedBreaks);
            toggle('patternIndividualFinishGroup', features.individualFinish);
        }

        /** Read point inputs + patterns + IGN from the DOM back into PointSystem. */
        collectFromDom() {
            const mode = this.selectedGamemode();
            if (this.points.pointSystems[mode]) {
                this.$('pointsSettings').querySelectorAll('input[type="number"]').forEach(input => {
                    this.points.pointSystems[mode][input.dataset.action] = parseInt(input.value, 10) || 0;
                });
            }
            const val = id => { const el = this.$(id); return el ? el.value : ''; };
            this.points.detectionPatterns = {
                teamElimination: val('patternTeamElim'),
                winner: val('patternWinner'),
                killPrefix: val('patternKillPrefix'),
                bedBreak: val('patternBedBreak'),
                individualFinish: val('patternIndividualFinish')
            };
            const ign = this.$('myIgn');
            if (ign) this.points.myIgn = ign.value.trim();
            const autoAdd = this.$('autoAddUnknownPlayers');
            if (autoAdd) this.points.autoAddUnknownPlayers = autoAdd.checked;
        }

        renderAll() {
            this.renderPoints();
            this.renderPatterns();
        }
    }

    global.Hive.renderers.SettingsRenderer = SettingsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
