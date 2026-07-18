/**
 * FileImport - infer a gamemode from a dropped/loaded log file's name.
 *
 * Hosts often save logs named after the gamemode ("bedwars.txt", "skywars 1.txt",
 * "block party.txt", "sg.txt"). We normalise the filename and match it against the
 * configured gamemodes plus a small alias table, so dropping a file can preselect
 * the right gamemode automatically.
 */
(function (global) {
    'use strict';

    // Common shorthand -> canonical gamemode name.
    const ALIASES = {
        sg: 'Survival Games',
        survival: 'Survival Games',
        survivalgames: 'Survival Games',
        bedwars: 'BedWars',
        bw: 'BedWars',
        skywars: 'SkyWars',
        sw: 'SkyWars',
        deathrun: 'DeathRun',
        dr: 'DeathRun',
        gravity: 'Gravity',
        blockdrop: 'BlockDrop',
        bd: 'BlockDrop',
        blockparty: 'Block Party',
        bp: 'Block Party'
    };

    const FileImport = {
        /** strip extension, lowercase, drop trailing numbers/spaces/punctuation. */
        normalize(filename) {
            return String(filename)
                .replace(/\.[^.]+$/, '')          // drop extension
                .toLowerCase()
                .replace(/[^a-z]+/g, '');          // keep letters only ("skywars 1" -> "skywars")
        },

        /**
         * Best-effort gamemode match for a filename.
         * @param {string} filename
         * @param {string[]} knownGamemodes  the currently-configured gamemode names
         * @returns {string|null} a canonical gamemode name or null
         */
        inferGamemode(filename, knownGamemodes) {
            const norm = this.normalize(filename);
            if (!norm) return null;

            // 1) exact normalized match against a configured gamemode
            for (const g of knownGamemodes) {
                if (g.replace(/\s+/g, '').toLowerCase() === norm) return g;
            }
            // 2) alias table (map to canonical, then confirm it's configured)
            if (ALIASES[norm]) {
                const canonical = ALIASES[norm];
                const match = knownGamemodes.find(g =>
                    g.replace(/\s+/g, '').toLowerCase() === canonical.replace(/\s+/g, '').toLowerCase());
                if (match) return match;
            }
            // 3) substring: filename contains a configured gamemode (or vice-versa)
            for (const g of knownGamemodes) {
                const gn = g.replace(/\s+/g, '').toLowerCase();
                if (norm.includes(gn) || gn.includes(norm)) return g;
            }
            // 4) substring against alias keys (e.g. "myskywarslog" -> skywars)
            for (const [alias, canonical] of Object.entries(ALIASES)) {
                if (norm.includes(alias)) {
                    const match = knownGamemodes.find(g =>
                        g.replace(/\s+/g, '').toLowerCase() === canonical.replace(/\s+/g, '').toLowerCase());
                    if (match) return match;
                }
            }
            return null;
        },

        isTextFile(file) {
            return /\.txt$/i.test(file.name) || file.type === 'text/plain';
        }
    };

    FileImport.ALIASES = ALIASES;

    global.Hive = global.Hive || {};
    global.Hive.FileImport = FileImport;

    if (typeof module !== 'undefined' && module.exports) module.exports = FileImport;
})(typeof window !== 'undefined' ? window : globalThis);
