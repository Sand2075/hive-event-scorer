/**
 * BedWarsParser - team mode with kills, final kills, and bed breaks.
 *
 * Real log formats (after color strip):
 *   "» FINAL KILL! SandRosey eliminated Akumatizedd"
 *   "» You killed IcyBeeWing"  /  "» You were killed by Galaxy 12000"
 *   "» Your bed was destroyed by SandRosey"
 *   "» Yellow Team has been eliminated!"   (+ a duplicate line w/o prefix)
 *   "» Green Team are the champions!"
 *   "» Game OVER!" / "» Sudden Death! All remaining beds have been destroyed"
 */
(function (global) {
    'use strict';
    const Base = global.Hive.parsers.GamemodeParser;
    const ChatUtils = global.Hive.ChatUtils;

    class BedWarsParser extends Base {
        get name() { return 'BedWars'; }

        detect(clean) {
            if (this.detectFinalKill(clean)) return true;
            if (this.detectLocalElimination(clean)) return true;
            if (this.detectFirstPersonKill(clean)) return true;
            if (this.detectBedBreak(clean)) return true;
            if (this.detectWinner(clean)) return true;
            if (this.detectTeamElimination(clean)) return true;
            // NOTE: no generic flavour-kill fallback here. In BedWars a kill only scores
            // (and only knocks a player out) once their bed is gone - the game marks
            // exactly those kills as "FINAL KILL!". Regular kills respawn the victim and
            // must never award a point, so anything that isn't a FINAL KILL is ignored.
            return false;
        }

        /**
         * "You have been eliminated from the game! [No bed]" - the local player's own
         * final elimination (no killer is credited). Marks them out so their team can
         * be counted as fully knocked out.
         */
        detectLocalElimination(clean) {
            if (!/You have been\s+eliminated\s+from the game/i.test(clean)) return false;
            const me = this.resolvePlayerName('You');
            if (me) {
                const team = this.resolvePlayerTeam(me);
                if (team) {
                    this.state.getOrCreatePlayerStats(me, team).deaths++;
                    this.markEliminated(me, team);
                }
            }
            return true;
        }

        detectFinalKill(clean) {
            // "FINAL KILL! <killer> eliminated <victim>"
            const m = clean.match(/FINAL KILL!?\s+(.+?)\s+eliminated\s+(.+?)\s*$/i);
            if (!m) return false;
            const killer = m[1].trim();
            const victim = m[2].trim();
            const killerTeam = this.resolvePlayerTeam(killer);
            const victimTeam = this.resolvePlayerTeam(victim);
            if (killerTeam) {
                const ks = this.state.getOrCreatePlayerStats(killer, killerTeam);
                ks.kills++; ks.finalKills++;
                this.engine.awardPoints(killerTeam, 'Kill');
                this.awardFirstBlood(killer, killerTeam);
                this.state.ensureScore(killerTeam).kills.push({
                    player: killer, victim, time: new Date().toISOString()
                });
            }
            if (victimTeam) {
                const vs = this.state.getOrCreatePlayerStats(victim, victimTeam);
                vs.deaths++;
                this.markEliminated(victim, victimTeam);
            }
            this.state.addLog(`FINAL KILL: ${killer} eliminated ${victim}`, 'success');
            return true;
        }

        detectFirstPersonKill(clean) {
            // In BedWars, "You killed X" is a regular kill (victim respawns) — no kill point.
            // Only FINAL KILLs award kill points. We still mark the victim's death so
            // player stats stay accurate, but skip the kill credit for the local player.
            let m = clean.match(/»?\s*You killed\s+(.+?)\s*$/i);
            if (m) {
                const victim = m[1].trim();
                const victimTeam = this.resolvePlayerTeam(victim);
                if (victimTeam) {
                    this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
                }
                return true;
            }
            // "You were killed by <killer>" — regular kill against local player; no kill pt to killer.
            m = clean.match(/»?\s*You were killed by\s+(.+?)\.?\s*$/i);
            if (m) {
                const victim = this.resolvePlayerName('You');
                if (!victim) return false;
                const victimTeam = this.resolvePlayerTeam(victim);
                if (victimTeam) this.state.getOrCreatePlayerStats(victim, victimTeam).deaths++;
                return true;
            }
            return false;
        }

        detectBedBreak(clean) {
            // "<breaker> destroyed <team>'s bed" or "Your bed was destroyed by <breaker>"
            let breaker = null;
            let m = clean.match(/»?\s*(.+?)\s+destroyed\s+(.+?)['’]?s?\s+bed/i);
            if (m) breaker = m[1].trim();
            if (!breaker) {
                m = clean.match(/»?\s*Your bed was destroyed by\s+(.+?)\s*$/i);
                if (m) breaker = m[1].trim();
            }
            if (!breaker) return false;

            const team = this.resolvePlayerTeam(breaker);
            if (!team) return false;
            const ps = this.state.getOrCreatePlayerStats(breaker, team);
            ps.bedBreaks++;
            this.engine.awardPoints(team, 'Bed Break');
            this.state.ensureScore(team).bedBreaks.push({ player: breaker, time: new Date().toISOString() });
            this.state.addLog(`${team} - ${breaker} broke a bed`, 'success');
            return true;
        }

        onGameOver(clean) {
            super.onGameOver(clean);
            this.state.addLog('BedWars game over', 'info');
        }
    }

    global.Hive.parsers.BedWars = BedWarsParser;
    if (typeof module !== 'undefined' && module.exports) module.exports = BedWarsParser;
})(typeof window !== 'undefined' ? window : globalThis);
