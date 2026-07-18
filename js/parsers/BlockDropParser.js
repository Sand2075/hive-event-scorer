/**
 * BlockDropParser - individual last-player-standing.
 *   "» humblespace5534 fell off the map! [5 XP]"
 *   "» Juliy4x forgot their parachute!"  /  "» Qv19v got ratio'd!"
 *   "» You died!"  /  "» Game OVER!"
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.SurvivalLastStandingParser;

    class BlockDropParser extends Base {
        get name() { return 'BlockDrop'; }
    }

    global.Hive.parsers.BlockDrop = BlockDropParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BlockDropParser;
})(typeof window !== 'undefined' ? window : globalThis);
