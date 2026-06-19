/**
 * Boot smoke test - loads ALL browser scripts (core + parsers + renderers + app)
 * against a tiny hand-rolled DOM shim that implements just enough of the DOM API
 * for the controller and renderers to wire up and run. Confirms:
 *   - the app boots with no exceptions
 *   - selecting a gamemode + processing a real log updates scores
 *   - switching tabs renders without throwing
 *   - JSON serialize/apply round-trips
 *
 * This is not a pixel test; it guards the JS wiring (IDs, listeners, render paths)
 * that the parser harness (run-logs.mjs) does not exercise. No dependencies.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const JS = join(ROOT, 'js');
const LOG_DIR = process.env.HIVE_LOGS || 'C:/Users/mkate/OneDrive/Desktop/prime start logs(1)';

// ---- minimal DOM shim --------------------------------------------------------
class El {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.dataset = {};
        this._attrs = {};
        this._classes = new Set();
        this._value = '';
        this._html = '';
        this._text = '';
        this._listeners = {};
        this.options = [];
        this.disabled = false;
        this.files = [];
        this.id = '';
    }
    get classList() {
        const s = this._classes;
        return {
            add: (...c) => c.forEach(x => s.add(x)),
            remove: (...c) => c.forEach(x => s.delete(x)),
            toggle: (c, on) => { if (on === undefined) on = !s.has(c); on ? s.add(c) : s.delete(c); return on; },
            contains: c => s.has(c)
        };
    }
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className() { return [...this._classes].join(' '); }
    set value(v) { this._value = v; }
    get value() { return this._value; }
    set textContent(v) { this._text = String(v); }
    get textContent() { return this._text; }
    set innerHTML(v) { this._html = String(v); }
    get innerHTML() { return this._html; }
    setAttribute(k, v) { this._attrs[k] = v; }
    getAttribute(k) { return this._attrs[k]; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    dispatch(type, ev = {}) { (this._listeners[type] || []).forEach(fn => fn(Object.assign({ target: this, currentTarget: this, preventDefault() {} }, ev))); }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    click() { this.dispatch('click'); }
}

const registry = new Map();
function mkEl(id, tag = 'div') { const e = new El(tag); e.id = id; registry.set(id, e); return e; }

// Build the elements the app references (mirrors index.html IDs).
[
    'saveBtn', 'loadBtn', 'fileInput', 'gamemode', 'processBtn', 'processSingleLine', 'clearInput',
    'chatInput', 'undoBtn', 'redoBtn', 'resetScores', 'scoreboard', 'clearLog', 'activityLog',
    'totalTeams', 'totalPlayers', 'teamPlacements', 'currentGamemode',
    'playerName', 'teamSelect', 'addPlayer', 'bulkPlayerNames', 'addBulkPlayers', 'clearAllPlayers', 'teamsGrid',
    'playerStatsSort', 'playerStats', 'pointRecord', 'gameHistory',
    'eventStandings', 'playerTotals', 'exportPlayersPng', 'exportWinnersPng',
    'playerModal', 'playerModalTitle', 'playerModalBody', 'playerModalClose',
    'settingsGamemode', 'addNewGamemode', 'deleteGamemode', 'pointsSettings',
    'patternTeamElim', 'patternWinner', 'patternKillPrefix', 'patternBedBreak', 'patternIndividualFinish',
    'patternKillGroup', 'patternBedBreakGroup', 'patternIndividualFinishGroup', 'myIgn',
    'saveSettings', 'resetSettings', 'exportSettings', 'importSettings', 'settingsFileInput'
].forEach(id => mkEl(id, id.includes('Input') || id === 'fileInput' ? 'input' : 'div'));

const navTabs = ['scorer', 'teams', 'stats', 'settings'].map(t => { const e = new El('a'); e.dataset.tab = t; return e; });
const tabContents = ['scorer', 'teams', 'stats', 'settings'].map(t => mkEl(t, 'div'));

const body = new El('body');
body.contains = () => true;
global.document = {
    body,
    getElementById: id => registry.get(id) || null,
    querySelectorAll: sel => {
        if (sel === '.nav-tab') return navTabs;
        if (sel === '.tab-content') return tabContents;
        return [];
    },
    querySelector: sel => {
        const m = sel.match(/\.nav-tab\[data-tab="(.+)"\]/);
        if (m) return navTabs.find(t => t.dataset.tab === m[1]) || null;
        if (sel === '.toast-stack') return null;
        return null;
    },
    createElement: tag => new El(tag),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') global.__domReady = fn; }
};
// In a real browser window === globalThis, so the modules' `window.Hive` and our
// `global.Hive` are the same object. Mirror that here instead of a separate window.
globalThis.addEventListener = () => {};
globalThis.scorer = null;
global.window = globalThis;
global.requestAnimationFrame = (fn) => fn();
global.localStorage = (() => {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
})();
// Mimic the browser's async ordering: setInterval returns a handle BEFORE the
// callback runs (so the caller can assign `timer` first), then we drive ticks.
const _intervals = [];
global.setInterval = (fn) => { const h = _intervals.push(fn) - 1; return h; };
global.clearInterval = (h) => { _intervals[h] = null; };
global.setTimeout = (fn) => { fn(); return 0; };
function drainIntervals() { for (let i = 0; i < 30; i++) _intervals.forEach(fn => fn && fn()); }
global.confirm = () => true;
global.alert = () => {};
global.Hive = {};

// ---- load scripts in index.html order ----------------------------------------
[
    'core/ChatUtils', 'core/Toast', 'core/PosterExport', 'core/PointSystem', 'core/GameState', 'core/ScoringEngine',
    'parsers/GamemodeParser', 'parsers/SurvivalLastStandingParser',
    'parsers/BedWarsParser', 'parsers/SkyWarsParser', 'parsers/SurvivalGamesParser',
    'parsers/DeathRunParser', 'parsers/GravityParser', 'parsers/BlockDropParser',
    'parsers/BlockPartyParser', 'parsers/index',
    'renderers/Renderer', 'renderers/ScoreboardRenderer', 'renderers/TeamsRenderer',
    'renderers/StatsRenderer', 'renderers/SettingsRenderer', 'app'
].forEach(m => require(join(JS, m + '.js')));

let pass = 0, fail = 0; const failures = [];
const check = (label, cond, detail = '') => cond ? pass++ : (fail++, failures.push(label + (detail ? ' (' + detail + ')' : '')));

// Boot the app (fires what DOMContentLoaded would).
global.__domReady();
const app = global.window.scorer;
check('app booted', !!app);

// Configure rosters + gamemode, then process the BedWars log.
app.state.teams = {
    YELLOW: { color: '#FFFF55', colorCode: 'e', players: ['NoahNacho27', 'SamsungWaffle', 'Juliy4x', 'sparkskye'] },
    BLUE: { color: '#5555FF', colorCode: '9', players: ['Qv19v', 'Akumatizedd', 'Ka1d4r3', 'FearPlaysYT'] },
    RED: { color: '#FF5555', colorCode: 'c', players: ['SandRosey', 'ToastedWoofle2', 'OcoPacoTaco', 'DuffinRexYT'] },
    GREEN: { color: '#00AA00', colorCode: '2', players: ['Quapot', 'Bo0ky', 'IcyBeeWing', 'Galaxy 12000'] }
};
document.getElementById('gamemode').value = 'BedWars';
document.getElementById('gamemode').dispatch('change', { target: document.getElementById('gamemode') });

const log = readFileSync(join(LOG_DIR, 'bedwars.txt'), 'utf8');
document.getElementById('chatInput').value = log;
document.getElementById('processBtn').click();

drainIntervals(); // let animateNumber finish
check('scores recorded after process', app.state.hasActiveScores());
check('Green has 1st place', app.state.scores.GREEN && app.state.scores.GREEN.events.some(e => e.type === '1st place'));
check('scoreboard rendered (non-empty)', /score-item/.test(document.getElementById('scoreboard').innerHTML));
check('quick stat totalTeams set', document.getElementById('totalTeams').textContent !== '');

// Tab switches render without throwing.
try { app.switchTab('teams'); app.switchTab('stats'); app.switchTab('settings'); app.switchTab('scorer'); check('tab switches OK', true); }
catch (e) { check('tab switches OK', false, e.message); }

// Stats render produced game-history (game completed on "Game OVER").
app.switchTab('stats');
check('game history rendered', /game-history-card/.test(document.getElementById('gameHistory').innerHTML) || app.state.gameHistory.length > 0);
check('event standings rendered', /standings-team/.test(document.getElementById('eventStandings').innerHTML));
check('player totals rendered', /player-total-chip/.test(document.getElementById('playerTotals').innerHTML));

// Player detail modal opens with a known player.
try {
    app.openPlayerModal('SandRosey');
    check('player modal opens', document.getElementById('playerModal').classList.contains('open') &&
        /Per-Game Breakdown/.test(document.getElementById('playerModalBody').innerHTML));
    app.closePlayerModal();
} catch (e) { check('player modal opens', false, e.message); }

// Aggregation helpers feed the PNG export.
const standings = app.statsView.playerStandingsList();
check('player standings list non-empty', standings.length > 0 && typeof standings[0].points === 'number');
const teamStand = app.statsView.aggregateTeamStandings();
check('team standings list non-empty', teamStand.length > 0 && Array.isArray(teamStand[0].players));
check('toast + poster modules present', !!global.Hive.Toast && !!global.Hive.PosterExport);

// JSON round-trip.
const json = JSON.parse(JSON.stringify(app.state.serialize({ saveDate: 'x' })));
const before = JSON.stringify(app.state.scores);
app.state.applyData(json, { includeTeams: true });
check('JSON round-trip preserves scores', JSON.stringify(app.state.scores) === before);

// Undo works.
const teamsBefore = Object.keys(app.state.teams).length;
app.performUndo();
check('undo executed without throw', true);

console.log(`\nBoot smoke: ${pass} passed, ${fail} failed`);
if (failures.length) { failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('All boot checks passed.');
