/**
 * GameState - single source of truth for all mutable scoring data:
 * teams (manual rosters), current-game scores, per-player stats, completed game
 * history, elimination ordering, undo/redo stacks, and the activity log.
 *
 * Also owns persistence: localStorage autosave + JSON import/export. Data shapes
 * match the previous monolith so JSON/localStorage saved by older versions still load.
 */
(function (global) {
    'use strict';

    const PREDEFINED_TEAMS = {
        'YELLOW': { color: '#FFFF55', colorCode: 'e' },
        'LIME': { color: '#55FF55', colorCode: 'a' },
        'RED': { color: '#FF5555', colorCode: 'c' },
        'BLUE': { color: '#5555FF', colorCode: '9' },
        'GOLD': { color: '#FFAA00', colorCode: '6' },
        'MAGENTA': { color: '#FF55FF', colorCode: 'd' },
        'AQUA': { color: '#55FFFF', colorCode: 'b' },
        'GRAY': { color: '#AAAAAA', colorCode: '7' },
        'PURPLE': { color: '#AA00AA', colorCode: '5' },
        'GREEN': { color: '#00AA00', colorCode: '2' },
        'DARK GRAY': { color: '#555555', colorCode: '8' },
        'CYAN': { color: '#00AAAA', colorCode: '3' },
        // Catch-all bucket for players found in logs who weren't assigned to a team.
        'UNKNOWN': { color: '#9CA3AF', colorCode: '7' }
    };

    const clone = (v) => JSON.parse(JSON.stringify(v));

    class GameState {
        constructor() {
            this.predefinedTeams = PREDEFINED_TEAMS;

            this.gamemode = '';
            this.currentGame = null;
            this.scores = {};        // teamName -> { score, placements[], kills[], bedBreaks[], events[] }
            this.teams = {};         // teamName -> { color, colorCode, players[] }
            this.playerStats = {};   // playerName -> { team, kills, deaths, finalKills, bedBreaks, eliminated, placement }
            this.activityLog = [];
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.gameHistory = [];
            this.currentGameCompleted = false;
            this.editingGameId = null;

            this.undoStack = [];
            this.redoStack = [];

            this.onLog = null; // optional callback(entry) for live UI updates
        }

        // ---- activity log -------------------------------------------------
        addLog(message, type = 'info') {
            const entry = { message, type, time: new Date().toISOString() };
            this.activityLog.push(entry);
            if (typeof this.onLog === 'function') this.onLog(entry);
            return entry;
        }

        // ---- team helpers -------------------------------------------------
        findPlayerTeam(playerName) {
            for (const [teamName, data] of Object.entries(this.teams)) {
                if (data.players && data.players.includes(playerName)) return teamName;
            }
            return null;
        }

        allPlayerNames() {
            const names = [];
            for (const data of Object.values(this.teams)) {
                if (data.players) names.push(...data.players);
            }
            return names;
        }

        /**
         * Add a player discovered in the logs but not assigned to any team to the
         * catch-all "UNKNOWN" team, creating that team if needed. Returns the team name.
         */
        addUnknownPlayer(playerName) {
            if (!playerName) return null;
            const teamName = 'UNKNOWN';
            const team = this.ensureTeam(teamName);
            if (!team.players.includes(playerName)) {
                team.players.push(playerName);
                this.addLog(`Added unknown player ${playerName} to ${teamName} team`, 'warning');
            }
            this.ensureScore(teamName);
            return teamName;
        }

        ensureTeam(teamName) {
            if (!this.teams[teamName]) {
                const preset = this.predefinedTeams[teamName] || { color: '#FFFFFF', colorCode: 'f' };
                this.teams[teamName] = { color: preset.color, colorCode: preset.colorCode, players: [] };
            }
            return this.teams[teamName];
        }

        getOrCreatePlayerStats(playerName, teamName) {
            if (!this.playerStats[playerName]) {
                this.playerStats[playerName] = {
                    team: teamName, kills: 0, deaths: 0, finalKills: 0,
                    bedBreaks: 0, eliminated: false, placement: null
                };
            } else if (teamName) {
                this.playerStats[playerName].team = teamName;
            }
            return this.playerStats[playerName];
        }

        ensureScore(teamName) {
            if (!this.scores[teamName]) {
                this.scores[teamName] = { score: 0, placements: [], kills: [], bedBreaks: [], events: [] };
            }
            return this.scores[teamName];
        }

        // ---- new game -----------------------------------------------------
        startNewGame(gamemode) {
            this.gamemode = gamemode;
            this.currentGame = {
                id: Date.now(),
                gamemode,
                startTime: new Date().toISOString(),
                endTime: null
            };
            this.scores = {};
            this.playerStats = {};
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.currentGameCompleted = false;

            Object.keys(this.teams).forEach(teamName => this.ensureScore(teamName));
        }

        hasActiveScores() {
            return Object.keys(this.scores).length > 0;
        }

        // ---- undo / redo --------------------------------------------------
        captureSnapshot(action) {
            return {
                action,
                currentGame: clone(this.currentGame),
                gameHistory: clone(this.gameHistory),
                teams: clone(this.teams),
                activityLog: clone(this.activityLog),
                playerStats: clone(this.playerStats),
                scores: clone(this.scores),
                eliminationOrder: clone(this.eliminationOrder),
                playerEliminationOrder: clone(this.playerEliminationOrder),
                playersFinished: clone(this.playersFinished),
                teamsFullyFinished: clone(this.teamsFullyFinished)
            };
        }

        restoreSnapshot(s) {
            this.currentGame = clone(s.currentGame);
            this.gameHistory = clone(s.gameHistory);
            this.teams = clone(s.teams);
            this.activityLog = clone(s.activityLog);
            this.playerStats = clone(s.playerStats);
            this.scores = clone(s.scores);
            this.eliminationOrder = clone(s.eliminationOrder);
            this.playerEliminationOrder = clone(s.playerEliminationOrder);
            this.playersFinished = clone(s.playersFinished);
            this.teamsFullyFinished = clone(s.teamsFullyFinished);
        }

        pushUndo(action) {
            this.undoStack.push(this.captureSnapshot(action));
            this.redoStack = [];
        }

        undo() {
            if (this.undoStack.length === 0) return null;
            const state = this.undoStack.pop();
            this.redoStack.push(this.captureSnapshot(state.action));
            this.restoreSnapshot(state);
            return state.action;
        }

        redo() {
            if (this.redoStack.length === 0) return null;
            const state = this.redoStack.pop();
            this.undoStack.push(this.captureSnapshot(state.action));
            this.restoreSnapshot(state);
            return state.action;
        }

        // ---- game history -------------------------------------------------
        saveGameToHistory() {
            if (!this.currentGame || !this.hasActiveScores()) return false;
            this.currentGame.endTime = new Date().toISOString();
            const record = {
                id: this.currentGame.id,
                gamemode: this.currentGame.gamemode,
                startTime: this.currentGame.startTime,
                endTime: this.currentGame.endTime,
                scores: clone(this.scores),
                playerStats: clone(this.playerStats),
                eliminationOrder: [...this.eliminationOrder],
                playerEliminationOrder: [...this.playerEliminationOrder]
            };
            const idx = this.gameHistory.findIndex(g => String(g.id) === String(record.id));
            if (idx !== -1) this.gameHistory[idx] = record;
            else this.gameHistory.push(record);
            this.currentGameCompleted = false;
            return true;
        }

        // ---- persistence --------------------------------------------------
        serialize(extra = {}) {
            return Object.assign({
                teams: this.teams,
                currentGame: this.currentGame,
                scores: this.scores,
                playerStats: this.playerStats,
                eliminationOrder: this.eliminationOrder,
                playerEliminationOrder: this.playerEliminationOrder,
                gameHistory: this.gameHistory,
                playersFinished: this.playersFinished,
                teamsFullyFinished: this.teamsFullyFinished,
                undoStack: this.undoStack,
                redoStack: this.redoStack,
                gamemode: this.gamemode
            }, extra);
        }

        applyData(data, { includeTeams = true } = {}) {
            if (!data) return;
            if (includeTeams && data.teams) this.teams = data.teams;
            if (data.currentGame) this.currentGame = data.currentGame;
            if (data.scores) this.scores = data.scores;
            if (data.playerStats) this.playerStats = data.playerStats;
            if (data.eliminationOrder) this.eliminationOrder = data.eliminationOrder;
            if (data.playerEliminationOrder) this.playerEliminationOrder = data.playerEliminationOrder;
            if (Array.isArray(data.gameHistory)) this.gameHistory = data.gameHistory;
            if (data.playersFinished) this.playersFinished = data.playersFinished;
            if (data.teamsFullyFinished) this.teamsFullyFinished = data.teamsFullyFinished;
            this.undoStack = Array.isArray(data.undoStack) ? data.undoStack : [];
            this.redoStack = Array.isArray(data.redoStack) ? data.redoStack : [];
            if (data.gamemode) this.gamemode = data.gamemode;
        }

        loadFromStorage() {
            if (typeof localStorage === 'undefined') return;
            const savedTeams = localStorage.getItem('hive_teams');
            if (savedTeams) {
                try { this.teams = JSON.parse(savedTeams); } catch (e) { console.error('teams load', e); }
            }
            try {
                const eventData = localStorage.getItem('hive_event_data');
                if (eventData) this.applyData(JSON.parse(eventData), { includeTeams: false });
                const history = localStorage.getItem('hive_game_history');
                if (history) {
                    const parsed = JSON.parse(history);
                    if (Array.isArray(parsed)) this.gameHistory = parsed;
                }
            } catch (e) {
                console.error('Error loading persistent data:', e);
                this.gameHistory = []; this.undoStack = []; this.redoStack = [];
            }
        }

        syncToStorage() {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem('hive_teams', JSON.stringify(this.teams));
            localStorage.setItem('hive_game_history', JSON.stringify(this.gameHistory));
            localStorage.setItem('hive_event_data', JSON.stringify(this.serialize()));
        }

        saveTeams() {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('hive_teams', JSON.stringify(this.teams));
            }
        }

        /**
         * Wipe all scoring statistics — current game, scores, per-player stats,
         * elimination/finish tracking, completed game history, and undo/redo — while
         * KEEPING team rosters (teams are only cleared from the Teams tab). Also
         * clears the persisted game/event localStorage keys so the wipe survives
         * reload; the hive_teams key is left intact.
         */
        wipeStatistics() {
            this.currentGame = null;
            this.scores = {};
            this.playerStats = {};
            this.eliminationOrder = [];
            this.playerEliminationOrder = [];
            this.playersFinished = {};
            this.teamsFullyFinished = [];
            this.gameHistory = [];
            this.currentGameCompleted = false;
            this.editingGameId = null;
            this.undoStack = [];
            this.redoStack = [];

            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('hive_game_history');
                localStorage.removeItem('hive_event_data');
                localStorage.removeItem('hive_emergency_backup'); // legacy key cleanup
            }
        }

        hasDataToSave() {
            return Object.keys(this.playerStats).length > 0 ||
                Object.keys(this.scores).length > 0 ||
                this.gameHistory.length > 0;
        }
    }

    GameState.PREDEFINED_TEAMS = PREDEFINED_TEAMS;

    global.Hive = global.Hive || {};
    global.Hive.GameState = GameState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GameState;
    }
})(typeof window !== 'undefined' ? window : globalThis);
