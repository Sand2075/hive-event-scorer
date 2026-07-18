/**
 * BlockPartyParser - individual last-player-standing.
 *   "» humblespace5534 made their last dance move [+2XP]"
 *   "» Juliy4x ain't stayin' alive"  /  "» Qv19v rock 'n' rolled into the void"
 *   "» Akumatizedd has two left feet"  /  "» NoahNacho27 fell off"
 * Ignores "Yellow is the chosen color!" style lines (no registered IGN present).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.SurvivalLastStandingParser;

    class BlockPartyParser extends Base {
        get name() { return 'Block Party'; }
    }

    global.Hive.parsers['Block Party'] = BlockPartyParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BlockPartyParser;
})(typeof window !== 'undefined' ? window : globalThis);
