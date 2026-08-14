/**
 * SettingsRenderer - the Settings tab: per-gamemode point values (placements
 * windowed to 12 with a show-all expander, up to 50), detection-pattern hints,
 * the "My IGN" field, and the misc scoring toggles.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.renderers.Renderer;

    const MAX_PLACEMENTS = 50;
    const VISIBLE_PLACEMENTS = 12;
    const PLACEMENT_RE = /^(\d+)(?:st|nd|rd|th) place$/;
    const INDIV_PLACEMENT_RE = /^Indiv (\d+)(?:st|nd|rd|th) place$/;

    class SettingsRenderer extends Base {
        selectedGamemode() {
            const sel = this.$('settingsGamemode');
            return sel ? sel.value : '';
        }

        /**
         * Non-placement keys hidden while their misc toggle is off.
         * @param {string} action Point-table key.
         * @returns {boolean} True when the key should be hidden.
         */
        isToggledOffKey(action) {
            if (action === 'Kill Leader') return !this.points.enableKillLeader;
            if (action === 'Mystery Chest') return !this.points.enableChestPoints;
            if (/^(Second|Third) (full team finish|last team standing)$/.test(action)) {
                return !this.points.enableExtendedTeamBonuses;
            }
            return false;
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

            const pointRow = (action, value, extraAttr) => `
                <div class="point-item"${extraAttr || ''}>
                    <label>${this.escapeHtml(action)}</label>
                    <input type="number" data-action="${this.escapeHtml(action)}" value="${value}" min="0" max="1000">
                </div>`;

            const otherRows = Object.entries(table)
                .filter(([action]) =>
                    !PLACEMENT_RE.test(action) &&
                    !INDIV_PLACEMENT_RE.test(action) &&
                    !this.isToggledOffKey(action)
                )
                .map(([action, value]) => pointRow(action, value))
                .join('');

            const { ChatUtils } = global.Hive;
            let placementRows = '';
            let hiddenRows = '';
            const features = this.points.featuresFor(mode) || {};
            for (let i = 1; i <= MAX_PLACEMENTS; i++) {
                const key = ChatUtils.ordinal(i) + ' place';
                const row = pointRow(key, table[key] || 0, ' data-placement="1"');
                if (i <= VISIBLE_PLACEMENTS) placementRows += row;
                else hiddenRows += row;
            }

            let indivPlacementRows = '';
            let hiddenIndivRows = '';

            if (features.pvp && this.points.enableSoloPlacements) {
                for (let i = 1; i <= MAX_PLACEMENTS; i++) {
                    const placement = ChatUtils.ordinal(i) + ' place';
                    const key = 'Indiv ' + placement;

                    const row = pointRow(
                        key,
                        table[key] || 0,
                        ' data-indiv-placement="1"'
                    );

                    if (i <= VISIBLE_PLACEMENTS) {
                        indivPlacementRows += row;
                    } else {
                        hiddenIndivRows += row;
                    }
                }
            }

            const tieModeRow = mode === 'Block Party' ? `
                <div class="point-item">
                    <label for="blockPartyTieMode">Tie Handling</label>
                    <select id="blockPartyTieMode">
                        <option value="shared-first"
                            ${this.points.blockPartyTieMode === 'shared-first' ? 'selected' : ''}>
                            Multiple 1st Places
                        </option>

                        <option value="shared-placement"
                            ${this.points.blockPartyTieMode === 'shared-placement' ? 'selected' : ''}>
                            Shared Next Placement
                        </option>
                    </select>
                </div>
            ` : features.pvp ? `
                <div class="point-item">
                    <label for="pvpTeamTieMode">Team Tie Handling</label>
                    <select id="pvpTeamTieMode">
                        <option value="shared-first"
                            ${this.points.pvpTeamTieMode === 'shared-first' ? 'selected' : ''}>
                            Multiple 1st Places
                        </option>

                        <option value="shared-placement"
                            ${this.points.pvpTeamTieMode === 'shared-placement' ? 'selected' : ''}>
                            Shared Next Placement
                        </option>
                    </select>
                </div>
            ` : '';

            host.innerHTML = `<h3>Point Values for ${this.escapeHtml(mode)}</h3>` +

            otherRows +
            tieModeRow +

            `<h4 class="placement-heading">
                ${features.pvp ? 'Team Placement Points' : 'Placement Points'}
            </h4>` +

            placementRows +

            `<div id="extraPlacements" class="extra-placements hidden">
                ${hiddenRows}
            </div>` +

            `<button
                type="button"
                id="togglePlacements"
                class="btn btn-secondary btn-small"
            >
                Show all ${MAX_PLACEMENTS} placements
            </button>` +

            (
                features.pvp && this.points.enableSoloPlacements
                    ? `
                        <h4 class="placement-heading">
                            Indiv Placement Points
                        </h4>

                        ${indivPlacementRows}

                        <div
                            id="extraIndivPlacements"
                            class="extra-placements hidden"
                        >
                            ${hiddenIndivRows}
                        </div>

                        <button
                            type="button"
                            id="toggleIndivPlacements"
                            class="btn btn-secondary btn-small"
                        >
                            Show all ${MAX_PLACEMENTS} indiv placements
                        </button>
                    `
                    : ''
            );

            const btn = this.$('togglePlacements');
            if (btn) {
                btn.addEventListener('click', () => {
                    const extra = this.$('extraPlacements');
                    if (!extra) return;
                    const nowHidden = extra.classList.toggle('hidden');
                    btn.textContent = nowHidden ? `Show all ${MAX_PLACEMENTS} placements` : 'Show fewer placements';
                });
            }

            const indivBtn = this.$('toggleIndivPlacements');

            if (indivBtn) {
                indivBtn.addEventListener('click', () => {
                    const extra =
                        this.$('extraIndivPlacements');

                    if (!extra) return;

                    const nowHidden =
                        extra.classList.toggle('hidden');

                    indivBtn.textContent = nowHidden
                        ? `Show all ${MAX_PLACEMENTS} indiv placements`
                        : 'Show fewer indiv placements';
                });
            }
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
            const killLeader = this.$('enableKillLeader');
            if (killLeader) killLeader.checked = this.points.enableKillLeader === true;
            const extBonuses = this.$('enableExtendedTeamBonuses');
            if (extBonuses) extBonuses.checked = this.points.enableExtendedTeamBonuses === true;
            const soloPlacements = this.$('enableSoloPlacements');
            if (soloPlacements) soloPlacements.checked = this.points.enableSoloPlacements === true;
            const chestPoints = this.$('enableChestPoints');
            if (chestPoints) chestPoints.checked = this.points.enableChestPoints === true;
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

        /** Read point inputs + patterns + IGN + misc toggles from the DOM back into PointSystem. */
        collectFromDom() {
            const mode = this.selectedGamemode();
            const table = this.points.pointSystems[mode];
            if (table) {
                const defaults = global.Hive.PointSystem.defaultPointSystems()[mode] || {};
                this.$('pointsSettings').querySelectorAll('input[type="number"]').forEach(input => {
                    const action = input.dataset.action;
                    const value = parseInt(input.value, 10) || 0;
                    const isPlacement = PLACEMENT_RE.test(action) || INDIV_PLACEMENT_RE.test(action);
                    // Zero-valued non-default placements stay out of the table.
                    if (isPlacement && value === 0 && defaults[action] === undefined) {
                        delete table[action];
                    } else {
                        table[action] = value;
                    }
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
            const killLeader = this.$('enableKillLeader');
            if (killLeader) this.points.enableKillLeader = killLeader.checked;
            const extBonuses = this.$('enableExtendedTeamBonuses');
            if (extBonuses) this.points.enableExtendedTeamBonuses = extBonuses.checked;
            const soloPlacements = this.$('enableSoloPlacements');
            if (soloPlacements) this.points.enableSoloPlacements = soloPlacements.checked;
            const chestPoints = this.$('enableChestPoints');
            if (chestPoints) this.points.enableChestPoints = chestPoints.checked;
            const tieMode = this.$('blockPartyTieMode');
            if (tieMode) this.points.blockPartyTieMode = tieMode.value;
            const pvpTieMode = this.$('pvpTeamTieMode');

            if (pvpTieMode) {
                this.points.pvpTeamTieMode = pvpTieMode.value;
            }
        }

        renderAll() {
            this.renderPoints();
            this.renderPatterns();
        }
    }

    global.Hive.renderers.SettingsRenderer = SettingsRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
