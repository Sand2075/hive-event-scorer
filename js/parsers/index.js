/**
 * Parser registry - maps a gamemode name to its parser class and builds parser
 * instances bound to the shared state/engine/points. Custom gamemodes (created in
 * Settings) fall back to the generic base parser.
 */
(function (global) {
    'use strict';
    const P = global.Hive.parsers;

    const REGISTRY = {
        'BedWars': P.BedWars,
        'SkyWars': P.SkyWars,
        'Survival Games': P['Survival Games'],
        'DeathRun': P.DeathRun,
        'Gravity': P.Gravity,
        'BlockDrop': P.BlockDrop,
        'Block Party': P['Block Party']
    };

    function classFor(gamemode) {
        if (REGISTRY[gamemode]) return REGISTRY[gamemode];
        const norm = String(gamemode || '').replace(/\s+/g, '').toLowerCase();
        for (const [name, cls] of Object.entries(REGISTRY)) {
            if (name.replace(/\s+/g, '').toLowerCase() === norm) return cls;
        }
        return P.GamemodeParser; // custom gamemodes use base behaviour
    }

    function buildAll(state, engine, points) {
        const built = {};
        for (const name of Object.keys(REGISTRY)) {
            built[name] = new REGISTRY[name](state, engine, points);
            engine.registerParser(name, built[name]);
        }
        return built;
    }

    global.Hive.parserRegistry = { REGISTRY, classFor, buildAll };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { REGISTRY, classFor, buildAll };
    }
})(typeof window !== 'undefined' ? window : globalThis);
