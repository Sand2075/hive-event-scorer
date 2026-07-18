/**
 * ChatUtils - stateless helpers for interpreting Hive chat lines.
 *
 * Hive chat lines are wrapped in Minecraft color codes (§x). Player chat also
 * carries a "»" arrow and embedded player names, so combat detection must be
 * able to tell a real event line apart from a player simply talking.
 *
 * Attached to the global `window.Hive.ChatUtils` namespace (browser) and also
 * exported for Node (test harness) via module.exports.
 */
(function (global) {
    'use strict';

    const ChatUtils = {
        /**
         * Remove all Minecraft §-color/format codes and trim.
         * The Hive uses non-standard codes beyond the vanilla 0-9/a-f/k-o/r set
         * (e.g. §g §i §j §m §p §t for custom gradients/styles), so we strip "§"
         * followed by ANY single non-whitespace character, then collapse the
         * doubled spaces those codes often leave behind.
         */
        stripColorCodes(text) {
            if (text == null) return '';
            return String(text)
                .replace(/§\S/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
        },

        /**
         * Detect a player *chat* line (someone talking), which must NOT be parsed
         * as a game event. After stripping colors these look like:
         *   "65 NoahNacho27 [U] » yes he did"
         *   "100 Qv19v [U] » no"
         *   "GIB2010 » i gtg"            (no rank/tag)
         *   "ZombiGhostt » I got u"
         * The distinguishing trait is a "[TAG] »" or "<name> »" produced by a real
         * player, as opposed to a system line which always has a colored prefix
         * immediately before "»" (e.g. "§c§l» ...").
         *
         * Heuristic: the text *before* the first "»" contains a bracketed rank tag
         * "[...]", OR it is a short "<name> " with no system keywords. We rely on the
         * raw (un-stripped) line for the most reliable signal: player chat always has
         * the "§l» §r" sequence preceded by a name token rather than a standalone
         * color-code prefix.
         */
        isPlayerChatLine(rawLine) {
            if (!rawLine) return false;
            // Player chat carries a level/rank bracket tag before the arrow:
            //   "§8 [§iU§8] §7§l» §r"  ->  stripped contains "[U] »"
            const stripped = this.stripColorCodes(rawLine);
            if (/\[[^\]]*\]\s*»/.test(stripped)) return true;

            // Tagless chat: "<name> » <msg>" where the segment before » has no leading
            // system marker. System lines after stripping start directly with "»".
            const arrowIdx = stripped.indexOf('»');
            if (arrowIdx === -1) return false;
            const before = stripped.slice(0, arrowIdx).trim();
            if (before === '') return false; // "» ..." == system line

            // A tagless chat prefix is a single token (the player name), optionally
            // preceded by a numeric rank/level. System lines that reach here would
            // contain spaces/keywords; a lone "<name>" (letters/digits/underscore) is chat.
            return /^(?:\d+\s+)?[A-Za-z0-9_]+$/.test(before);
        },

        /** Text that follows the first "»" arrow, or null if there is no arrow. */
        afterArrow(line) {
            const m = line.match(/»\s*(.*)$/);
            return m ? m[1] : null;
        },

        /** Ordinal suffix for a number: 1 -> "st", 2 -> "nd", 11 -> "th". */
        ordinalSuffix(num) {
            const j = num % 10;
            const k = num % 100;
            if (j === 1 && k !== 11) return 'st';
            if (j === 2 && k !== 12) return 'nd';
            if (j === 3 && k !== 13) return 'rd';
            return 'th';
        },

        /** "3" -> "3rd". */
        ordinal(num) {
            return `${num}${this.ordinalSuffix(num)}`;
        },

        /**
         * Find every registered player name that appears in `text`, in order of
         * appearance. Used to attribute generic flavor-verb kills (killer first,
         * victim last). Matching is whitespace-boundary aware so "Sand" won't match
         * inside "SandRosey".
         */
        findPlayersInText(text, allPlayerNames) {
            const found = [];
            for (const name of allPlayerNames) {
                const idx = ChatUtils._indexOfName(text, name);
                if (idx !== -1) found.push({ name, idx });
            }
            found.sort((a, b) => a.idx - b.idx);
            return found.map(f => f.name);
        },

        /**
         * Index of a player name in text using boundaries that tolerate Minecraft
         * punctuation ("Quapot's", "Galaxy 12000."). Names can contain spaces and
         * digits, so we match the literal name flanked by non-word chars or string
         * ends. Returns -1 if not present.
         */
        _indexOfName(text, name) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`);
            const m = re.exec(text);
            if (!m) return -1;
            // m.index points at the boundary char; offset by its length.
            return m.index + (m[1] ? m[1].length : 0);
        }
    };

    global.Hive = global.Hive || {};
    global.Hive.ChatUtils = ChatUtils;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChatUtils;
    }
})(typeof window !== 'undefined' ? window : globalThis);
