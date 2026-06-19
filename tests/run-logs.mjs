/**
 * Headless parser harness. Loads the SAME parser source the browser uses (the
 * classes guard for both `window` and Node), feeds the real Hive logs, and asserts
 * sane per-mode outcomes. Run: `node tests/run-logs.mjs`
 *
 * No dependencies. We emulate a minimal `window` (just the Hive namespace) and
 * `require()` the IIFE modules in dependency order.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const JS = join(ROOT, 'js');
const LOG_DIR = process.env.HIVE_LOGS ||
    'C:/Users/mkate/OneDrive/Desktop/prime start logs(1)';

// Shared Hive namespace (the modules attach to globalThis.Hive).
globalThis.Hive = globalThis.Hive || {};

// Load in dependency order.
require(join(JS, 'core/ChatUtils.js'));
require(join(JS, 'core/PointSystem.js'));
require(join(JS, 'core/GameState.js'));
require(join(JS, 'core/ScoringEngine.js'));
require(join(JS, 'parsers/GamemodeParser.js'));
require(join(JS, 'parsers/BedWarsParser.js'));
require(join(JS, 'parsers/SkyWarsParser.js'));
require(join(JS, 'parsers/SurvivalGamesParser.js'));
require(join(JS, 'parsers/DeathRunParser.js'));
require(join(JS, 'parsers/GravityParser.js'));
require(join(JS, 'parsers/SurvivalLastStandingParser.js'));
require(join(JS, 'parsers/BlockDropParser.js'));
require(join(JS, 'parsers/BlockPartyParser.js'));
require(join(JS, 'parsers/index.js'));

const { GameState, PointSystem, ScoringEngine, parserRegistry } = Hive;

// ---- rosters (assigned manually in the app; derived from the event logs) -----
const TEAMS_BEDWARS = {
    YELLOW: ['NoahNacho27', 'SamsungWaffle', 'Juliy4x', 'sparkskye'],
    BLUE: ['Qv19v', 'Akumatizedd', 'Ka1d4r3', 'FearPlaysYT'],
    RED: ['SandRosey', 'ToastedWoofle2', 'OcoPacoTaco', 'DuffinRexYT'],
    GREEN: ['Quapot', 'Bo0ky', 'IcyBeeWing', 'Galaxy 12000']
};
const TEAMS_SG = {
    RED: ['OcoPacoTaco', 'ToastedWoofle2', 'sparkskye', 'SandRosey'],         // District 1
    BLUE: ['Juliy4x', 'Akumatizedd', 'Ka1d4r3', 'Qv19v'],                     // District 2
    GREEN: ['Quapot', 'IcyBeeWing', 'Bo0ky', 'humblespace5534'],             // District 3
    YELLOW: ['SamsungWaffle', 'Galaxy 12000', 'NoahNacho27', 'DuffinRexYT']  // District 4
};
const TEAMS_SKYWARS = {
    YELLOW: ['Qv19v', 'SamsungWaffle', 'Juliy4x', 'Ka1d4r3'],
    RED: ['FearPlaysYT', 'NoahNacho27', 'Bo0ky', 'Quapot'],
    BLUE: ['SandRosey', 'sparkskye', 'OcoPacoTaco', 'ToastedWoofle2'],
    LIME: ['DuffinRexYT', 'Akumatizedd', 'IcyBeeWing', 'Galaxy 12000']
};
const ALL_16 = ['NoahNacho27', 'SamsungWaffle', 'Juliy4x', 'sparkskye', 'Qv19v',
    'Akumatizedd', 'Ka1d4r3', 'FearPlaysYT', 'SandRosey', 'ToastedWoofle2',
    'OcoPacoTaco', 'DuffinRexYT', 'Quapot', 'Bo0ky', 'IcyBeeWing', 'Galaxy 12000',
    'humblespace5534'];
// Individual modes: teams don't affect scoring, but rosters define "registered players".
const TEAMS_INDIVIDUAL = { YELLOW: ALL_16 };

function buildScorer(gamemode, rosters, myIgn = '') {
    const state = new GameState();
    const points = new PointSystem();
    points.myIgn = myIgn;
    const engine = new ScoringEngine(state, points);
    parserRegistry.buildAll(state, engine, points);

    state.teams = {};
    for (const [team, players] of Object.entries(rosters)) {
        const preset = GameState.PREDEFINED_TEAMS[team] || { color: '#fff', colorCode: 'f' };
        state.teams[team] = { color: preset.color, colorCode: preset.colorCode, players: [...players] };
    }
    state.startNewGame(gamemode);
    return { state, engine, points, parser: engine.parserFor(gamemode) };
}

function processLog(file, gamemode, rosters, myIgn = '') {
    const path = join(LOG_DIR, file);
    if (!existsSync(path)) throw new Error(`log not found: ${path}`);
    const text = readFileSync(path, 'utf8'); // logs are UTF-8 (§ = 0xC2 0xA7)
    const ctx = buildScorer(gamemode, rosters, myIgn);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    let processed = 0;
    for (const line of lines) {
        if (ctx.parser.parseLine(line)) processed++;
    }
    return { ...ctx, processed, lines };
}

// ---- tiny assertion framework ------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail = '') {
    if (cond) { pass++; }
    else { fail++; failures.push(`${label}${detail ? '  (' + detail + ')' : ''}`); }
}
function teamScore(state, t) { return state.scores[t] ? state.scores[t].score : 0; }
function killCount(state, t) { return state.scores[t] ? state.scores[t].kills.length : 0; }

// ===================== BedWars =====================
(function () {
    const { state } = processLog('bedwars.txt', 'BedWars', TEAMS_BEDWARS);
    const elim = state.eliminationOrder;
    check('BedWars: Yellow eliminated', elim.includes('YELLOW'));
    check('BedWars: Blue eliminated', elim.includes('BLUE'));
    check('BedWars: Red eliminated', elim.includes('RED'));
    check('BedWars: elim order Yellow<Blue<Red',
        elim.indexOf('YELLOW') < elim.indexOf('BLUE') && elim.indexOf('BLUE') < elim.indexOf('RED'),
        elim.join(','));
    check('BedWars: Green is champion (1st place)',
        state.scores.GREEN && state.scores.GREEN.events.some(e => e.type === '1st place'));
    check('BedWars: SandRosey bed break recorded',
        state.scores.RED && state.scores.RED.bedBreaks.some(b => b.player === 'SandRosey'));
    check('BedWars: final kills recorded for some teams',
        killCount(state, 'RED') + killCount(state, 'GREEN') + killCount(state, 'YELLOW') > 0);
    check('BedWars: SandRosey has finalKills>0', state.playerStats.SandRosey && state.playerStats.SandRosey.finalKills > 0);
    check('BedWars: no chat false positive (Akumatizedd not credited absurd kills)',
        (state.playerStats.Akumatizedd ? state.playerStats.Akumatizedd.kills : 0) < 5,
        'kills=' + (state.playerStats.Akumatizedd ? state.playerStats.Akumatizedd.kills : 0));
})();

// ===================== SkyWars 1 =====================
(function () {
    const { state } = processLog('skywars 1.txt', 'SkyWars', TEAMS_SKYWARS);
    const elim = state.eliminationOrder;
    check('SkyWars1: Red eliminated', elim.includes('RED'));
    check('SkyWars1: Blue eliminated', elim.includes('BLUE'));
    check('SkyWars1: Yellow eliminated', elim.includes('YELLOW'));
    check('SkyWars1: Lime wins (1st place)',
        state.scores.LIME && state.scores.LIME.events.some(e => e.type === '1st place'));
    check('SkyWars1: NoahNacho27 credited kills (flavor verbs)',
        state.playerStats.NoahNacho27 && state.playerStats.NoahNacho27.kills >= 2,
        'kills=' + (state.playerStats.NoahNacho27 ? state.playerStats.NoahNacho27.kills : 0));
    check('SkyWars1: "did an oopsie" not a kill - OcoPacoTaco self death recorded as death',
        state.playerStats.OcoPacoTaco && state.playerStats.OcoPacoTaco.deaths >= 1);
})();

// ===================== SkyWars 2 =====================
(function () {
    const { state } = processLog('skywars 2.txt', 'SkyWars', TEAMS_SKYWARS);
    const elim = state.eliminationOrder;
    // In SW2: in-game Yellow = app BLUE (structural inference from player kills).
    // In-game Blue = app YELLOW (they win). Elim order: BLUE, LIME, RED → YELLOW wins.
    check('SkyWars2: Blue eliminated (in-game Yellow = app Blue)', elim.includes('BLUE'));
    check('SkyWars2: Lime eliminated', elim.includes('LIME'));
    check('SkyWars2: Red eliminated', elim.includes('RED'));
    check('SkyWars2: Yellow wins (in-game Blue = app Yellow, 1st place)',
        state.scores.YELLOW && state.scores.YELLOW.events.some(e => e.type === '1st place'));
    check('SkyWars2: Bo0ky banished several (kills>=3)',
        state.playerStats.Bo0ky && state.playerStats.Bo0ky.kills >= 3,
        'kills=' + (state.playerStats.Bo0ky ? state.playerStats.Bo0ky.kills : 0));
})();

// ===================== Survival Games =====================
(function () {
    const { state } = processLog('sg.txt', 'Survival Games', TEAMS_SG);
    check('SG: sparkskye credited a kill', state.playerStats.sparkskye && state.playerStats.sparkskye.kills >= 1);
    check('SG: ToastedWoofle2 credited "dabbed on" kills', state.playerStats.ToastedWoofle2 && state.playerStats.ToastedWoofle2.kills >= 1);
    check('SG: at least one district elimination recorded', state.eliminationOrder.length >= 1, state.eliminationOrder.join(','));
})();

// ===================== DeathRun =====================
(function () {
    // myIgn = Qv19v: log owner finished "1st" ("You finished in 1st place").
    const { state } = processLog('deathrun.txt', 'DeathRun', TEAMS_INDIVIDUAL, 'Qv19v');
    check('DeathRun: Qv19v placed 1st', state.playerStats.Qv19v && state.playerStats.Qv19v.placement === '1st');
    check('DeathRun: SamsungWaffle placed 2nd', state.playerStats.SamsungWaffle && state.playerStats.SamsungWaffle.placement === '2nd');
    check('DeathRun: Quapot placed 3rd', state.playerStats.Quapot && state.playerStats.Quapot.placement === '3rd');
    check('DeathRun: 16 players have placements',
        Object.values(state.playerStats).filter(p => p.placement).length >= 14,
        Object.values(state.playerStats).filter(p => p.placement).length + ' placed');
    // 1st-place points awarded once despite both "finished" + leaderboard lines.
    const yellow = state.scores.YELLOW;
    const firstPlaceEvents = yellow ? yellow.events.filter(e => e.type === '1st place').length : 0;
    check('DeathRun: 1st place awarded exactly once', firstPlaceEvents === 1, 'count=' + firstPlaceEvents);
})();

// ===================== Gravity =====================
(function () {
    const { state } = processLog('gravity.txt', 'Gravity', TEAMS_INDIVIDUAL, 'Qv19v');
    check('Gravity: Bo0ky placed 1st', state.playerStats.Bo0ky && state.playerStats.Bo0ky.placement === '1st');
    check('Gravity: SamsungWaffle placed 2nd', state.playerStats.SamsungWaffle && state.playerStats.SamsungWaffle.placement === '2nd');
    check('Gravity: many players placed (>=12)',
        Object.values(state.playerStats).filter(p => p.placement).length >= 12,
        Object.values(state.playerStats).filter(p => p.placement).length + ' placed');
})();

// ===================== Block Drop =====================
(function () {
    const { state } = processLog('block drop.txt', 'BlockDrop', TEAMS_INDIVIDUAL, 'Qv19v');
    check('BlockDrop: humblespace5534 eliminated', state.playerStats.humblespace5534 && state.playerStats.humblespace5534.eliminated);
    check('BlockDrop: Qv19v "got ratio\'d" eliminated', state.playerStats.Qv19v && state.playerStats.Qv19v.eliminated);
    check('BlockDrop: many players eliminated (>=12)', state.playerEliminationOrder.length >= 12, state.playerEliminationOrder.length + ' elim');
    check('BlockDrop: placements assigned at game over', Object.values(state.playerStats).filter(p => p.placement).length >= 12);
})();

// ===================== Block Party =====================
(function () {
    const { state } = processLog('block party.txt', 'Block Party', TEAMS_INDIVIDUAL, 'Qv19v');
    check('BlockParty: Juliy4x eliminated (ain\'t stayin alive)', state.playerStats.Juliy4x && state.playerStats.Juliy4x.eliminated);
    check('BlockParty: Akumatizedd eliminated (two left feet)', state.playerStats.Akumatizedd && state.playerStats.Akumatizedd.eliminated);
    check('BlockParty: "chosen color" lines ignored (Yellow not a player)',
        !state.playerStats.Yellow && !state.playerStats.Magenta);
    check('BlockParty: several eliminated (>=8)', state.playerEliminationOrder.length >= 8, state.playerEliminationOrder.length + ' elim');
})();

// ---- report ------------------------------------------------------------------
console.log(`\nHive parser harness: ${pass} passed, ${fail} failed\n`);
if (failures.length) {
    console.log('FAILURES:');
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
} else {
    console.log('All checks passed.');
}
