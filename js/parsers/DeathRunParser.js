/**
 * DeathRunParser - team mode scored by individual finish placement, plus a
 * "First full team finish" bonus.
 *   "» You finished in 1st place! [01:21.801]"
 *   "» SamsungWaffle has finished in 2nd place! ..."
 *   "» 1st Place: Qv19v [01:21.801]"  (final leaderboard)
 *
 * Both the per-player "finished in" lines and the final "Nth Place:" leaderboard
 * appear; recording is idempotent (placement awarded once per player) so seeing
 * both does not double-count.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class DeathRunParser extends Base {
        get name() { return 'DeathRun'; }

        detect(clean) {
            return this.detectIndividualPlacement(clean);
        }
    }

    global.Hive.parsers.DeathRun = DeathRunParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = DeathRunParser;
})(typeof window !== 'undefined' ? window : globalThis);
