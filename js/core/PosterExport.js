/**
 * PosterExport - draws two shareable PNG "posters" on a <canvas> and downloads
 * them. No external dependencies; works offline from file://.
 *
 *  1) Player standings  - every player ranked by total event points.
 *  2) Event winners     - the team leaderboard with the champion highlighted.
 *
 * Callers pass already-aggregated data (see StatsRenderer.aggregate*), so this
 * module owns presentation only, not scoring.
 */
(function (global) {
    'use strict';

    const C = {
        bg: '#15131F',
        panel: '#1E1B2E',
        row: '#272338',
        purple: '#7C3AED',
        yellow: '#FACC15',
        gold: '#F59E0B',
        text: '#F4F2FA',
        soft: '#C7C1DC',
        muted: '#8B83A6'
    };

    function dl(canvas, filename) {
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }

    function header(ctx, w, title, subtitle) {
        ctx.fillStyle = C.purple;
        ctx.fillRect(0, 0, w, 8);
        ctx.fillStyle = C.yellow;
        ctx.font = '700 40px Inter, Segoe UI, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(title, 48, 78);
        ctx.fillStyle = C.soft;
        ctx.font = '400 20px Inter, Segoe UI, sans-serif';
        ctx.fillText(subtitle, 48, 110);
    }

    function footer(ctx, w, h) {
        ctx.fillStyle = C.muted;
        ctx.font = '400 15px Inter, Segoe UI, sans-serif';
        ctx.fillText('Hive Event Scorer  •  Not affiliated with The Hive', 48, h - 28);
        const stamp = new Date().toLocaleString();
        const tw = ctx.measureText(stamp).width;
        ctx.fillText(stamp, w - 48 - tw, h - 28);
    }

    function medal(i) { return i === 0 ? '#FACC15' : i === 1 ? '#C7C1DC' : i === 2 ? '#F59E0B' : null; }

    const PosterExport = {
        /**
         * @param {Array<{name,team,teamColor,points}>} players  sorted desc by points
         * @param {string} eventTitle
         */
        playerStandings(players, eventTitle = 'Event Standings') {
            const top = 150, rowH = 46, pad = 48;
            const h = top + Math.max(players.length, 1) * rowH + 70;
            const w = 900;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
            header(ctx, w, eventTitle, 'Player Standings — total points');

            players.forEach((p, i) => {
                const y = top + i * rowH;
                ctx.fillStyle = C.row;
                roundRect(ctx, pad, y, w - pad * 2, rowH - 8, 8); ctx.fill();
                // team color stripe
                ctx.fillStyle = p.teamColor || C.purple;
                ctx.fillRect(pad, y, 6, rowH - 8);

                const m = medal(i);
                ctx.fillStyle = m || C.muted;
                ctx.font = '800 22px Inter, sans-serif';
                ctx.fillText(`#${i + 1}`, pad + 20, y + 27);

                ctx.fillStyle = C.text;
                ctx.font = '600 22px Inter, sans-serif';
                ctx.fillText(p.name, pad + 90, y + 27);

                if (p.team) {
                    ctx.fillStyle = C.muted;
                    ctx.font = '400 16px Inter, sans-serif';
                    ctx.fillText(p.team, pad + 90, y + 27 + 0); // team appended after name below if room
                }

                const pts = `${p.points} pts`;
                ctx.fillStyle = C.yellow;
                ctx.font = '800 22px Inter, sans-serif';
                const tw = ctx.measureText(pts).width;
                ctx.fillText(pts, w - pad - 20 - tw, y + 27);
            });

            if (players.length === 0) {
                ctx.fillStyle = C.muted; ctx.font = '400 20px Inter, sans-serif';
                ctx.fillText('No player data yet.', pad + 10, top + 30);
            }

            footer(ctx, w, h);
            dl(canvas, `event-player-standings-${Date.now()}.png`);
        },

        /**
         * @param {Array<{team,teamColor,points,players:Array<{name,points}>}>} teams sorted desc
         * @param {string} eventTitle
         */
        eventWinners(teams, eventTitle = 'Event Champions') {
            const top = 150, pad = 48, w = 900;
            const blockH = t => 64 + (t.players ? t.players.length : 0) * 26 + 16;
            const h = top + teams.reduce((s, t) => s + blockH(t), 0) + 70;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = Math.max(h, top + 120);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, canvas.height);
            header(ctx, w, eventTitle, 'Final team standings');

            let y = top;
            teams.forEach((t, i) => {
                const bh = blockH(t);
                ctx.fillStyle = C.panel;
                roundRect(ctx, pad, y, w - pad * 2, bh - 10, 10); ctx.fill();
                ctx.fillStyle = t.teamColor || C.purple;
                ctx.fillRect(pad, y, 8, bh - 10);

                const m = medal(i);
                ctx.fillStyle = m || C.muted;
                ctx.font = '800 26px Inter, sans-serif';
                ctx.fillText(i === 0 ? '★ 1st' : `#${i + 1}`, pad + 24, y + 40);

                ctx.fillStyle = C.text;
                ctx.font = '800 26px Inter, sans-serif';
                ctx.fillText(t.team, pad + 130, y + 40);

                const pts = `${t.points} pts`;
                ctx.fillStyle = C.yellow;
                ctx.font = '800 26px Inter, sans-serif';
                const tw = ctx.measureText(pts).width;
                ctx.fillText(pts, w - pad - 24 - tw, y + 40);

                let py = y + 64;
                (t.players || []).forEach(pl => {
                    ctx.fillStyle = C.soft;
                    ctx.font = '400 17px Inter, sans-serif';
                    ctx.fillText(pl.name, pad + 130, py + 14);
                    const pp = `${pl.points}`;
                    ctx.fillStyle = C.muted;
                    const ppw = ctx.measureText(pp).width;
                    ctx.fillText(pp, w - pad - 24 - ppw, py + 14);
                    py += 26;
                });

                y += bh;
            });

            if (teams.length === 0) {
                ctx.fillStyle = C.muted; ctx.font = '400 20px Inter, sans-serif';
                ctx.fillText('No completed games yet.', pad + 10, top + 30);
            }

            footer(ctx, w, canvas.height);
            dl(canvas, `event-winners-${Date.now()}.png`);
        }
    };

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    global.Hive = global.Hive || {};
    global.Hive.PosterExport = PosterExport;

    if (typeof module !== 'undefined' && module.exports) module.exports = PosterExport;
})(typeof window !== 'undefined' ? window : globalThis);
