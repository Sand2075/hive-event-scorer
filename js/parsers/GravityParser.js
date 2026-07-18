/**
 * GravityParser - team mode scored by individual finish placement plus a
 * "First full team finish" bonus. Like DeathRun but with Gravity's phrasing:
 *   "» Bo0ky finished all maps and came in 1st place! [00:38.966]"
 *   "» You finished all maps and came in 5th place! ..."
 * Ignore: "» Galaxy 12000 skipped Data!" (not a placement).
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class GravityParser extends Base {
        get name() { return 'Gravity'; }

        detect(clean) {
            return this.detectIndividualPlacement(clean);
        }

        placementRegexes() {
            return [
                { pattern: /(?:»\s*)?(You|[A-Za-z0-9_ ]+?)\s+finished all maps and came in\s+(\d+)(?:st|nd|rd|th)\s+place/i, name: 1, pos: 2 },
                // Fall back to the generic phrasings too.
                ...super.placementRegexes()
            ];
        }
    }

    global.Hive.parsers.Gravity = GravityParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = GravityParser;
})(typeof window !== 'undefined' ? window : globalThis);
