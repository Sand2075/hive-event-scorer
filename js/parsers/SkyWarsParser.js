/**
 * SkyWarsParser - team mode, kills only, last team standing wins.
 *
 * Kills use arbitrary flavour verbs between two players, so detection is purely
 * structural (handled by the base detectGenericKill). Self-deaths ("did an
 * oopsie!") credit no kill.
 *   "» NoahNacho27 rolled Bo0ky beyond space and time!"
 *   "» Ka1d4r3 silenced Galaxy 12000"
 *   "» Red Team has been ELIMINATED!"
 *   "» Lime Team are the WINNERS!"
 * Noise ignored: "... is the new kill leader!", "Mystery Chest was opened by ...".
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;

    class SkyWarsParser extends Base {
        get name() { return 'SkyWars'; }

        detect(clean) {
            if (this.isNoise(clean)) return false;
            if (this.detectWinner(clean)) return true;
            if (this.detectTeamElimination(clean)) return true;
            // "You were killed by X" -> local player death + credit killer.
            const m = clean.match(/»?\s*You were killed by\s+(.+?)(?:\.\s*They had .+)?$/i);
            if (m) {
                const victim = this.resolvePlayerName('You');
                const killerName = m[1].trim();
                if (victim && killerName) {
                    return this.recordKill(killerName, victim) !== false;
                }
                if (victim) return this.recordDeath(victim) !== false;
            }
            if (this.detectGenericKill(clean)) return true;
            return false;
        }

        isNoise(clean) {
            return /is the new kill leader/i.test(clean) ||
                /Mystery Chest was opened by/i.test(clean) ||
                /spellbook for you/i.test(clean) ||
                /wasn't very lucky/i.test(clean) ||
                /minimum play height/i.test(clean);
        }
    }

    global.Hive.parsers.SkyWars = SkyWarsParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SkyWarsParser;
})(typeof window !== 'undefined' ? window : globalThis);
