/**
 * PointSystem - default scoring tables, gamemode feature flags, detection-pattern
 * defaults, and settings persistence (localStorage + JSON import/export).
 *
 * Point values mirror The Hive event scoring. `features` declares which event
 * categories a gamemode supports so the UI and parsers can branch off one source.
 */
(function (global) {
    'use strict';

        function defaultPointSystems() {
        return {
            'DeathRun': {
                '1st place': 160,
                '2nd place': 144,
                '3rd place': 128,
                '4th place': 112,
                '5th place': 96,
                '6th place': 80,
                '7th place': 72,
                '8th place': 64,
                '9th place': 56,
                '10th place': 48,
                '11th place': 40,
                '12th place': 32,
                '13th place': 24,
                '14th place': 16,
                '15th place': 8,
                'First full team finish': 30,
                'Second full team finish': 20,
                'Third full team finish': 10
            },

            'SkyWars': {
                '1st place': 80,
                '2nd place': 60,
                '3rd place': 40,
                'Kill': 45,
                'Kill Leader': 45
            },

            'Survival Games': {
                '1st place': 80,
                '2nd place': 60,
                '3rd place': 40,
                'Kill': 50
            },

            'BedWars': {
                '1st place': 80,
                '2nd place': 60,
                '3rd place': 40,
                'Kill': 45,
                'Bed Break': 60
            },

            'Gravity': {
                '1st place': 160,
                '2nd place': 144,
                '3rd place': 128,
                '4th place': 112,
                '5th place': 96,
                '6th place': 80,
                '7th place': 72,
                '8th place': 64,
                '9th place': 56,
                '10th place': 48,
                '11th place': 40,
                '12th place': 32,
                '13th place': 24,
                '14th place': 16,
                '15th place': 8,
                'First full team finish': 30,
                'Second full team finish': 20,
                'Third full team finish': 10
            },

            'BlockDrop': {
                '1st place': 160,
                '2nd place': 144,
                '3rd place': 128,
                '4th place': 112,
                '5th place': 96,
                '6th place': 80,
                '7th place': 72,
                '8th place': 64,
                '9th place': 56,
                '10th place': 48,
                '11th place': 40,
                '12th place': 32,
                '13th place': 24,
                '14th place': 16,
                '15th place': 8,
                'Last team standing': 30,
                'Second last team standing': 20,
                'Third last team standing': 10
            },

            'Block Party': {
                '1st place': 160,
                '2nd place': 144,
                '3rd place': 128,
                '4th place': 112,
                '5th place': 96,
                '6th place': 80,
                '7th place': 72,
                '8th place': 64,
                '9th place': 56,
                '10th place': 48,
                '11th place': 40,
                '12th place': 32,
                '13th place': 24,
                '14th place': 16,
                '15th place': 8,
                'Last team standing': 30,
                'Second last team standing': 20,
                'Third last team standing': 10
            }
        };
    }

    function defaultFeatures() {
        return {
            // kills: combat kills score; bedBreaks: bed-break events score;
            // individualFinish: per-player placement lines; teamFinish: full-team-finish bonus;
            // individualSurvival: last-player-standing placement from elimination order;
            // teamElimination: team placement (1st/2nd/3rd) is decided by the order teams are
            //   knocked out - i.e. when every player on a team has been killed - not by points.
            'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: false, teamElimination: false },
            'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true },
            'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true },
            'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false, individualSurvival: false, teamElimination: true },
            'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true, individualSurvival: true, teamElimination: false },
            'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false },
            'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false, individualSurvival: true, teamElimination: false }
        };
    }

    function defaultDetectionPatterns() {
        // Documentation-only hints shown in Settings. Parsers use their own robust
        // regexes; these strings describe the in-game formats for the user.
        return {
            teamElimination: '§c§l» [TEAM] Team has been ELIMINATED',
            winner: '§6§l» [TEAM] Team are the WINNERS',
            killPrefix: '§...§l»',
            bedBreak: "§c§l» Your bed was destroyed by [PLAYER]",
            individualFinish: '§a§l» [PLAYER] has finished in [N]th place'
        };
    }

    class PointSystem {
        constructor() {
            this.pointSystems = defaultPointSystems();
            this.gamemodeFeatures = defaultFeatures();
            this.detectionPatterns = defaultDetectionPatterns();
            this.myIgn = '';
            // When a player appears in the logs but isn't on any team, add them to an
            // "UNKNOWN" team so their events still score. Toggleable in Settings.
            this.autoAddUnknownPlayers = true;
            this.STORAGE_KEY = 'hive_settings';
        }

        /** Default/protected gamemodes that cannot be deleted from the UI. */
        static get DEFAULT_MODES() {
            return Object.keys(defaultPointSystems());
        }

        load() {
            try {
                const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return;
                const settings = JSON.parse(raw);
                if (settings.pointSystems) this.pointSystems = settings.pointSystems;
                this.gamemodeFeatures = PointSystem._mergeFeatures(settings.gamemodeFeatures);
                if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
                if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
                if (typeof settings.autoAddUnknownPlayers === 'boolean') this.autoAddUnknownPlayers = settings.autoAddUnknownPlayers;
            } catch (err) {
                console.error('Error loading settings:', err);
                this.reset();
            }
        }

        save() {
            const settings = {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn,
                autoAddUnknownPlayers: this.autoAddUnknownPlayers
            };
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
            }
            return settings;
        }

        reset() {
            this.pointSystems = defaultPointSystems();
            this.gamemodeFeatures = defaultFeatures();
            this.detectionPatterns = defaultDetectionPatterns();
            this.autoAddUnknownPlayers = true;
            this.save();
        }

        importSettings(settings) {
            if (settings.pointSystems) this.pointSystems = settings.pointSystems;
            this.gamemodeFeatures = PointSystem._mergeFeatures(settings.gamemodeFeatures);
            if (settings.detectionPatterns) this.detectionPatterns = settings.detectionPatterns;
            if (typeof settings.myIgn === 'string') this.myIgn = settings.myIgn;
            if (typeof settings.autoAddUnknownPlayers === 'boolean') this.autoAddUnknownPlayers = settings.autoAddUnknownPlayers;
            this.save();
        }

        /**
         * Gamemode feature flags are scoring LOGIC, not user-editable preferences, so the
         * current code defaults must always win - otherwise a stale localStorage copy would
         * pin the scoring model to an old version. We keep persisted entries only for custom
         * gamemodes the defaults don't know about.
         */
        static _mergeFeatures(saved) {
            return Object.assign({}, saved || {}, defaultFeatures());
        }

        exportSettings() {
            return {
                pointSystems: this.pointSystems,
                gamemodeFeatures: this.gamemodeFeatures,
                detectionPatterns: this.detectionPatterns,
                myIgn: this.myIgn,
                autoAddUnknownPlayers: this.autoAddUnknownPlayers
            };
        }

        /** Look up a point table tolerant of spacing/case ("Block Drop" == "BlockDrop"). */
        forGamemode(gamemode) {
            return PointSystem._tolerantLookup(this.pointSystems, gamemode);
        }

        featuresFor(gamemode) {
            return PointSystem._tolerantLookup(this.gamemodeFeatures, gamemode);
        }

        static _tolerantLookup(map, gamemode) {
            if (!gamemode) return null;
            if (map[gamemode]) return map[gamemode];
            const norm = String(gamemode).replace(/\s+/g, '').toLowerCase();
            for (const [key, val] of Object.entries(map)) {
                if (key.replace(/\s+/g, '').toLowerCase() === norm) return val;
            }
            return null;
        }
    }

    PointSystem.defaultPointSystems = defaultPointSystems;
    PointSystem.defaultFeatures = defaultFeatures;
    PointSystem.defaultDetectionPatterns = defaultDetectionPatterns;

    global.Hive = global.Hive || {};
    global.Hive.PointSystem = PointSystem;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PointSystem;
    }
})(typeof window !== 'undefined' ? window : globalThis);
