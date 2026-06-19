/**
 * SurvivalLastStandingParser - shared base for individual last-player-standing
 * modes (Block Drop, Block Party). Players are eliminated one by one via flavour
 * phrases; final placement is derived from elimination order on "Game OVER".
 *
 * Detection is structural: a non-chat "»" line that names exactly one registered
 * player and is not a known noise line counts as that player's elimination. This
 * accepts ANY flavour verb without a whitelist.
 *
 * Block Party also emits "Yellow is the chosen color!" lines containing color
 * words - these name no registered player (color words aren't IGNs) so they are
 * naturally ignored, but we also guard against them explicitly.
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;
    const ChatUtils = global.Hive.ChatUtils;

    class SurvivalLastStandingParser extends Base {
        detect(clean) {
            if (this.isNoise(clean) || this.isLobbyLine(clean)) return false;

            const players = ChatUtils.findPlayersInText(clean, this.state.allPlayerNames());

            // "You died!" -> local player elimination.
            if (players.length === 0 && /you died/i.test(clean)) {
                const me = this.resolvePlayerName('You');
                if (me) return this.recordDeath(me) !== false;
                return false;
            }

            if (players.length === 1) {
                return this.recordDeath(players[0]) !== false;
            }
            // Two-player lines aren't expected in these modes; ignore to stay safe.
            return false;
        }

        isNoise(clean) {
            return /is the chosen color/i.test(clean) ||
                /color bomb/i.test(clean) ||
                /Powerup/i.test(clean) ||
                /Top Layer/i.test(clean) ||
                /Mystery Chest/i.test(clean) ||
                /XP\s+for breaking/i.test(clean);
        }

        onGameOver(clean) {
            super.onGameOver(clean);
            // Finalise placements from elimination order, then mark the game complete.
            this.engine.finalizePlayerPlacements();
            this.state.addLog(`${this.name} game over - placements finalised`, 'info');
        }
    }

    global.Hive.parsers.SurvivalLastStandingParser = SurvivalLastStandingParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = SurvivalLastStandingParser;
})(typeof window !== 'undefined' ? window : globalThis);
