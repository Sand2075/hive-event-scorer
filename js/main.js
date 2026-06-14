/**
 * An advanced chat interpreter for Hive Events
 */
class HiveEventScorer {
    constructor() {
        this.gamemode = '';
        this.currentGame = null;
        this.scores = {}; // { teamName: { score, placements: [], kills: [], bedBreaks: [] } }
        this.teams = {}; // { teamName: { color, colorCode, players: [] } }
        this.playerStats = {}; // { playerName: { team, kills, deaths, finalKills, bedBreaks, eliminated, placement } }
        this.activityLog = [];
        this.eliminationOrder = []; // Track team elimination order for placement
        this.playerEliminationOrder = []; // Track individual player eliminations
        this.playersFinished = {}; // Track which players have finished for team finish detection
        this.teamsFullyFinished = []; // Track which teams have all players finished
        this.gameHistory = []; // Store completed games with their stats
        this.hasUnsavedChanges = false;
        this.editingGameId = null; // Track which saved game is being edited
        this.undoStack = []; // Stack for undo operations

        // Predefined teams with color codes
        this.predefinedTeams = {
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
            'CYAN': { color: '#00AAAA', colorCode: '3' }
        };

        // Game-specific point systems
        this.pointSystems = {
            'DeathRun': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'First full team finish': 1
            },
            'SkyWars': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1
            },
            'BlockDrop': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'Last team standing': 1
            },
            'BedWars': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1,
                'Bed Break': 1
            },
            'Block Party': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'Last team standing': 1
            },
            'Gravity': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'First full team finish': 1
            },
            'Survival Games': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1
            }
        };

        // Gamemode feature flags - defines which patterns apply to which modes
        this.gamemodeFeatures = {
            'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true },
            'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false },
            'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false },
            'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false },
            'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false },
            'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true },
            'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false }
        };

        this.init();
    }

    async init() {
        this.loadTeams();
        this.loadSettings();
        this.loadEmergencySave(); // Try to recover from crash
        this.updateGamemodeDropdowns(); // Populate gamemode dropdowns
        this.setupEventListeners();
        this.updateUI();

        // Prompt user before closing if they have unsaved data
        window.addEventListener('beforeunload', (e) => {
            // Emergency save to browser cache
            this.emergencySave();

            // Ask if user wants to save
            if (this.hasDataToSave()) {
                const message = 'You have unsaved data. Do you want to download a JSON backup before leaving?';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });

        // Auto-save to emergency cache every 30 seconds
        setInterval(() => {
            if (this.hasDataToSave()) {
                this.emergencySave();
            }
        }, 30000);
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = e.target.dataset.tab;
                this.switchTab(targetTab);
            });
        });

        // Gamemode selection
        document.getElementById('gamemode').addEventListener('change', (e) => {
            this.gamemode = e.target.value;
            if (this.gamemode) {
                this.startNewGame();
            }
            this.updateUI();
        });

        // Process chat
        document.getElementById('processBtn').addEventListener('click', () => {
            this.processChat();
        });

        document.getElementById('clearInput').addEventListener('click', () => {
            document.getElementById('chatInput').value = '';
        });

        // Reset scores
        document.getElementById('resetScores').addEventListener('click', () => {
            if (confirm('Reset all scores for this game?')) {
                this.scores = {};
                this.eliminationOrder = [];
                this.playerEliminationOrder = [];
                this.addLog('Scores reset', 'warning');
                this.updateUI();
            }
        });

        // Save/Load
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveData();
        });

        document.getElementById('loadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.importJSON(e);
        });

        // Clear log
        document.getElementById('clearLog').addEventListener('click', () => {
            this.activityLog = [];
            this.updateActivityLog();
        });

        // Undo button
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.performUndo();
        });

        // Game history editing (for manual point adjustments)
        const gameHistory = document.getElementById('gameHistory');
        if (gameHistory) {
            gameHistory.addEventListener('click', (e) => {
                this.handleGameHistoryActions(e);
            });
        }

        // Team management
        this.setupTeamManagement();

        // Settings management
        this.setupSettingsManagement();
    }

    switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // Remove active class from all nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab
        document.getElementById(tabName).classList.add('active');

        // Add active class to clicked nav tab
        document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');

        // Update content based on tab
        if (tabName === 'teams') {
            this.renderTeams();
        } else if (tabName === 'stats') {
            this.renderStats();
        } else if (tabName === 'settings') {
            this.populatePointsSettings();
            this.populateDetectionPatterns();
        }
    }

    setupTeamManagement() {
        // Add player to team
        const addPlayerBtn = document.getElementById('addPlayer');
        if (addPlayerBtn) {
            addPlayerBtn.addEventListener('click', () => {
                this.addPlayerToTeam();
            });
        }

        // Enter key in player name field
        const playerNameInput = document.getElementById('playerName');
        if (playerNameInput) {
            playerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addPlayerToTeam();
                }
            });
        }

        // Bulk IGN add
        const addBulkBtn = document.getElementById('addBulkPlayers');
        if (addBulkBtn) {
            addBulkBtn.addEventListener('click', () => {
                this.addPlayerToTeam(true);
            });
        }

        // Clear all players
        const clearAllBtn = document.getElementById('clearAllPlayers');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                if (confirm('Remove all players from all teams? This action can be undone.')) {
                    this.clearAllPlayers();
                }
            });
        }
    }

    setupSettingsManagement() {
        // Gamemode selector in settings
        const settingsGamemodeSelect = document.getElementById('settingsGamemode');
        if (settingsGamemodeSelect) {
            settingsGamemodeSelect.addEventListener('change', () => {
                this.populatePointsSettings();
                this.updatePatternVisibility();
            });
        }

        // Add new gamemode
        const addNewGamemodeBtn = document.getElementById('addNewGamemode');
        if (addNewGamemodeBtn) {
            addNewGamemodeBtn.addEventListener('click', () => {
                this.addNewGamemode();
            });
        }

        // Delete gamemode
        const deleteGamemodeBtn = document.getElementById('deleteGamemode');
        if (deleteGamemodeBtn) {
            deleteGamemodeBtn.addEventListener('click', () => {
                this.deleteGamemode();
            });
        }

        // Save settings
        const saveSettingsBtn = document.getElementById('saveSettings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        // Reset settings
        const resetSettingsBtn = document.getElementById('resetSettings');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                    this.resetSettings();
                }
            });
        }

        // Export settings
        const exportSettingsBtn = document.getElementById('exportSettings');
        if (exportSettingsBtn) {
            exportSettingsBtn.addEventListener('click', () => {
                this.exportSettingsJSON();
            });
        }

        // Import settings
        const importSettingsBtn = document.getElementById('importSettings');
        const settingsFileInput = document.getElementById('settingsFileInput');
        if (importSettingsBtn && settingsFileInput) {
            importSettingsBtn.addEventListener('click', () => {
                settingsFileInput.click();
            });

            settingsFileInput.addEventListener('change', (e) => {
                this.importSettingsJSON(e);
            });
        }

        // Load initial settings UI
        this.populatePointsSettings();
        this.populateDetectionPatterns();
    }

    saveGameToHistory() {
        if (!this.currentGame || Object.keys(this.scores).length === 0) {
            return;
        }

        // Mark end time
        this.currentGame.endTime = new Date().toISOString();

        // Create game record
        const gameRecord = {
            id: this.currentGame.id,
            gamemode: this.currentGame.gamemode,
            startTime: this.currentGame.startTime,
            endTime: this.currentGame.endTime,
            scores: JSON.parse(JSON.stringify(this.scores)),
            playerStats: JSON.parse(JSON.stringify(this.playerStats)),
            eliminationOrder: [...this.eliminationOrder],
            playerEliminationOrder: [...this.playerEliminationOrder]
        };

        this.gameHistory.push(gameRecord);
        this.syncPersistentData();
        this.addLog(`Game saved to history: ${this.currentGame.gamemode}`, 'info');
    }

    syncPersistentData() {
        // Save game history and current game state to localStorage
        localStorage.setItem('hive_game_history', JSON.stringify(this.gameHistory));
        localStorage.setItem('hive_event_data', JSON.stringify({
            scores: this.scores,
            playerStats: this.playerStats
        }));
    }

    startNewGame() {
        if (!this.gamemode) {
            alert('Please select a gamemode first!');
            return;
        }

        if (this.currentGame && Object.keys(this.scores).length > 0) {
            if (confirm('Start a new game? Current game will be saved to history.')) {
                // Save current game to history
                this.saveGameToHistory();
            } else {
                return;
            }
        }

        this.currentGame = {
            id: Date.now(),
            gamemode: this.gamemode,
            startTime: new Date().toISOString(),
            endTime: null
        };

        this.scores = {};
        this.playerStats = {};
        this.eliminationOrder = [];
        this.playerEliminationOrder = [];
        this.playersFinished = {};
        this.teamsFullyFinished = [];

        // Initialize scores for all teams
        Object.keys(this.teams).forEach(teamName => {
            this.scores[teamName] = {
                score: 0,
                placements: [],
                kills: [],
                bedBreaks: [],
                events: []
            };
        });

        this.syncPersistentData();
        this.addLog(`Started new ${this.gamemode} game`, 'info');
        this.updateUI();
    }

    processChat() {
        if (!this.gamemode) {
            alert('Please select a gamemode first!');
            return;
        }

        const chatInput = document.getElementById('chatInput').value;
        if (!chatInput.trim()) {
            alert('Please enter some chat text to process!');
            return;
        }

        const lines = chatInput.split('\n').filter(l => l.trim());
        let processedCount = 0;

        for (const line of lines) {
            if (this.parseLine(line)) {
                processedCount++;
            }
        }

        // Clear the chat box
        document.getElementById('chatInput').value = '';

        this.addLog(`Processed ${processedCount} events from ${lines.length} lines`);
        this.updateUI();
        this.hasUnsavedChanges = true;
    }

    parseLine(line) {
        // Check if line has the kill/elimination prefix
        const hasPrefix = line.includes('-§c§l-+');
        const cleanLine = this.stripColorCodes(line);

        // Check for team elimination
        if (this.detectTeamElimination(cleanLine, hasPrefix)) {
            return true;
        }

        // Check for winner
        if (this.detectWinner(cleanLine, hasPrefix)) {
            return true;
        }

        // Check for kills
        if (this.detectKill(cleanLine, hasPrefix)) {
            return true;
        }

        // Check for bed breaks
        if (this.detectBedBreak(cleanLine, hasPrefix)) {
            return true;
        }

        // Check for individual placements
        if (this.detectIndividualPlacement(cleanLine)) {
            return true;
        }

        return false;
    }

    detectTeamElimination(line, hasPrefix) {
        // More consistent detection: require prefix for team eliminations
        if (!hasPrefix) return false;

        // Pattern: "[TEAM] has been ELIMINATED" or "[TEAM] Team has been ELIMINATED"
        const match = line.match(/»\s*(.+?)\s+(?:Team\s+)?has been ELIMINATED/i);
        if (match) {
            const teamName = match[1].trim().toUpperCase();

            // Check if this is one of our teams
            if (this.teams[teamName]) {
                this.eliminationOrder.push(teamName);

                // Track all players on this team as eliminated with placement
                const team = this.teams[teamName];
                if (team.players) {
                    for (const playerName of team.players) {
                        this.markPlayerEliminated(playerName, teamName);
                    }
                }

                this.addLog(`${teamName} eliminated (${this.eliminationOrder.length} teams out)`, 'warning');

                // Record team placement and try to finalize if only one team left
                this.recordTeamEliminationIfNeeded(teamName);
                this.tryFinalizeGamePlacements();
                return true;
            }
        }
        return false;
    }

    detectWinner(line, hasPrefix) {
        // Pattern: "[TEAM] is the WINNER"
        // Can work with or without prefix
        const match = hasPrefix ?
            line.match(/»\s*(.+?)\s+is the WINNER/i) :
            line.match(/(.+?)\s+is the WINNER/i);

        if (match) {
            const teamName = match[1].trim().toUpperCase();

            if (this.teams[teamName]) {
                // Winner gets 1st place
                this.awardPoints(teamName, '1st place');
                this.addLog(`${teamName} WON!`, 'success');

                // Finalize all team and player placements
                this.finalizeGamePlacements(teamName);
                return true;
            }
        }
        return false;
    }

    detectKill(line, hasPrefix) {
        // Simplified detection: just check for prefix and extract player names
        if (!hasPrefix) return false;

        // Check for FINAL KILL pattern first
        const finalKillMatch = line.match(/FINAL KILL.*?\s+(.+?)\s+eliminated\s+(.+?)\s*$/i);
        if (finalKillMatch) {
            const killerName = this.stripColorCodes(finalKillMatch[1]).trim();
            const victimName = this.stripColorCodes(finalKillMatch[2]).trim();

            // Find teams for these players
            let killerTeam = this.findPlayerTeam(killerName);
            let victimTeam = this.findPlayerTeam(victimName);

            // Track stats
            if (killerTeam) {
                const killer = this.getOrCreatePlayerStats(killerName, killerTeam);
                killer.finalKills++;
                killer.kills++;
                this.awardPoints(killerTeam, 'Kill');
                this.scores[killerTeam].kills.push({
                    player: killerName,
                    victim: victimName,
                    time: new Date().toISOString()
                });
            }

            if (victimTeam) {
                const victim = this.getOrCreatePlayerStats(victimName, victimTeam);
                victim.deaths++;
                victim.eliminated = true;
                if (!this.playerEliminationOrder.includes(victimName)) {
                    this.playerEliminationOrder.push(victimName);
                }
            }

            this.addLog(`FINAL KILL: ${killerName} eliminated ${victimName}`, 'success');
            return true;
        }

        // Extract text after the prefix and » symbol
        const match = line.match(/»\s*(.+)/i);
        if (!match) return false;

        const text = match[1];

        // Find all known players in this line
        const playersFound = [];
        for (const teamName in this.teams) {
            const team = this.teams[teamName];
            if (team.players) {
                for (const player of team.players) {
                    if (text.includes(player)) {
                        playersFound.push({ name: player, team: teamName });
                    }
                }
            }
        }

        // Need at least 2 players: killer and victim
        if (playersFound.length >= 2) {
            // First player = killer, last player = victim
            const killer = playersFound[0].name;
            const killerTeam = playersFound[0].team;
            const victim = playersFound[playersFound.length - 1].name;
            const victimTeam = playersFound[playersFound.length - 1].team;

            // Track stats
            const killerStats = this.getOrCreatePlayerStats(killer, killerTeam);
            killerStats.kills++;

            const victimStats = this.getOrCreatePlayerStats(victim, victimTeam);
            victimStats.deaths++;

            // Mark victim as eliminated
            this.markPlayerEliminated(victim, victimTeam);

            // Award points to killer's team
            this.awardPoints(killerTeam, 'Kill');
            this.scores[killerTeam].kills.push({
                player: killer,
                victim: victim,
                time: new Date().toISOString()
            });
            this.addLog(`${killerTeam} - ${killer} eliminated ${victim}`, 'success');

            // Try to finalize placements if only one team active
            this.tryFinalizeGamePlacements();
            return true;
        }

        return false;
    }

    detectBedBreak(line, hasPrefix) {
        // Pattern: "PlayerName destroyed [TEAM]'s bed"
        // More consistent with prefix
        const pattern = hasPrefix ?
            /»\s*(.+?)\s+destroyed\s+(.+?)['']?s?\s+bed/i :
            /(.+?)\s+destroyed\s+(.+?)['']?s?\s+bed/i;

        const match = line.match(pattern);
        if (match) {
            const breaker = match[1].trim();

            const breakerTeam = this.findPlayerTeam(breaker);
            if (breakerTeam) {
                // Track in player stats
                const player = this.getOrCreatePlayerStats(breaker, breakerTeam);
                player.bedBreaks++;

                this.awardPoints(breakerTeam, 'Bed Break');
                this.scores[breakerTeam].bedBreaks.push({
                    player: breaker,
                    time: new Date().toISOString()
                });
                this.addLog(`${breakerTeam} - ${breaker} broke a bed`, 'success');
                return true;
            }
        }
        return false;
    }

    detectIndividualPlacement(line) {
        // Pattern: "PlayerName finished in 1st place"
        const match = line.match(/(.+?)\s+finished in\s+(\d+)(?:st|nd|rd|th)\s+place/i);
        if (match) {
            const playerName = match[1].trim();
            const position = parseInt(match[2]);

            const team = this.findPlayerTeam(playerName);
            if (team) {
                let placementKey = null;
                if (position === 1) placementKey = '1st place';
                else if (position === 2) placementKey = '2nd place';
                else if (position === 3) placementKey = '3rd place';
                else if (position === 4) placementKey = '4th place';
                else if (position === 5) placementKey = '5th place';

                if (placementKey) {
                    this.awardPoints(team, placementKey);
                    this.scores[team].placements.push({
                        player: playerName,
                        position: position,
                        time: new Date().toISOString()
                    });
                    this.addLog(`${team} - ${playerName} finished ${position}${this.getOrdinalSuffix(position)}`, 'info');

                    // Track player finish for team finish detection
                    if (!this.playersFinished[team]) {
                        this.playersFinished[team] = [];
                    }
                    if (!this.playersFinished[team].includes(playerName)) {
                        this.playersFinished[team].push(playerName);
                        this.checkTeamFullyFinished(team);
                    }

                    return true;
                }
            }
        }
        return false;
    }

    checkTeamFullyFinished(teamName) {
        // Check if all players on this team have finished
        if (!this.teams[teamName] || !this.teams[teamName].players) return;

        const teamPlayers = this.teams[teamName].players;
        const finishedPlayers = this.playersFinished[teamName] || [];

        // Check if all team members have finished
        const allFinished = teamPlayers.every(player => finishedPlayers.includes(player));

        if (allFinished && !this.teamsFullyFinished.includes(teamName)) {
            this.teamsFullyFinished.push(teamName);

            // Award "First full team finish" bonus if this is the first team
            if (this.teamsFullyFinished.length === 1) {
                this.awardPoints(teamName, 'First full team finish');
                this.addLog(`${teamName} is the FIRST team to have all players finish!`, 'success');
            } else {
                this.addLog(`${teamName} - all players have finished (Team #${this.teamsFullyFinished.length})`, 'info');
            }
        }
    }

    calculatePlacements() {
        if (this.eliminationOrder.length === 0) return;

        const totalTeams = Object.keys(this.teams).length;

        // Teams eliminated first get last place
        // Teams eliminated last get 2nd place (if there's a winner)
        // Winner gets 1st place

        for (let i = 0; i < this.eliminationOrder.length; i++) {
            const teamName = this.eliminationOrder[i];
            const placement = totalTeams - i; // First eliminated = last place

            let placementKey = null;
            if (placement === 2) placementKey = '2nd place';
            else if (placement === 3) placementKey = '3rd place';
            else if (placement === 4) placementKey = '4th place';
            else if (placement === 5) placementKey = '5th place';

            if (placementKey && !this.hasPlacement(teamName, placementKey)) {
                this.awardPoints(teamName, placementKey);
            }

            // Update player placements for this team
            const team = this.teams[teamName];
            if (team && team.players) {
                for (const playerName of team.players) {
                    const player = this.getOrCreatePlayerStats(playerName, teamName);
                    if (!player.placement) {
                        player.placement = `${placement}${this.getOrdinalSuffix(placement)}`;
                    }
                }
            }
        }
    }

    hasPlacement(teamName, placementKey) {
        if (!this.scores[teamName]) return false;
        return this.scores[teamName].events.some(e => e.type === placementKey);
    }

    calculatePlayerPlacements() {
        if (this.playerEliminationOrder.length === 0) return;

        // Count all players across all teams
        let totalPlayers = 0;
        for (const teamName in this.teams) {
            totalPlayers += this.teams[teamName].players.length;
        }

        // Assign placements based on elimination order
        for (let i = 0; i < this.playerEliminationOrder.length; i++) {
            const playerName = this.playerEliminationOrder[i];
            const placement = totalPlayers - i; // First eliminated = last place
            const team = this.findPlayerTeam(playerName);

            if (team) {
                let placementKey = null;
                if (placement === 1) placementKey = '1st place';
                else if (placement === 2) placementKey = '2nd place';
                else if (placement === 3) placementKey = '3rd place';
                else if (placement === 4) placementKey = '4th place';
                else if (placement === 5) placementKey = '5th place';

                if (placementKey) {
                    // Check if this player already has a placement recorded
                    const alreadyRecorded = this.scores[team]?.placements.some(
                        p => p.player === playerName
                    );

                    if (!alreadyRecorded) {
                        this.awardPoints(team, placementKey);
                        if (!this.scores[team].placements) {
                            this.scores[team].placements = [];
                        }
                        this.scores[team].placements.push({
                            player: playerName,
                            position: placement,
                            time: new Date().toISOString()
                        });
                    }
                }
            }
        }
    }

    // New helper methods for placement tracking
    markPlayerEliminated(playerName, teamName) {
        const player = this.getOrCreatePlayerStats(playerName, teamName);
        if (!player.eliminated) {
            player.eliminated = true;
            if (!this.playerEliminationOrder.includes(playerName)) {
                this.playerEliminationOrder.push(playerName);
            }
        }
    }

    recordTeamEliminationIfNeeded(teamName) {
        // Record team placement based on elimination order
        const totalTeams = Object.keys(this.teams).length;
        const placement = totalTeams - this.eliminationOrder.indexOf(teamName);
        const placementKey = this.getPlacementKey(placement);
        if (placementKey && !this.hasPlacement(teamName, placementKey)) {
            this.awardPoints(teamName, placementKey);
        }
    }

    getPlacementKey(position) {
        const map = { 1: '1st place', 2: '2nd place', 3: '3rd place', 4: '4th place', 5: '5th place' };
        return map[position] || null;
    }

    getActiveTeams() {
        return Object.keys(this.teams).filter(teamName => {
            return !this.eliminationOrder.includes(teamName);
        });
    }

    tryFinalizeGamePlacements() {
        const activeTeams = this.getActiveTeams();
        if (activeTeams.length === 1) {
            // Only one team left - they're the winner!
            this.finalizeGamePlacements(activeTeams[0]);
        }
    }

    recordTeamPlacement(teamName, placement) {
        const placementKey = this.getPlacementKey(placement);
        if (placementKey && !this.hasPlacement(teamName, placementKey)) {
            this.awardPoints(teamName, placementKey);
        }
        // Update all players on this team with their placement
        const team = this.teams[teamName];
        if (team && team.players) {
            for (const playerName of team.players) {
                const player = this.getOrCreatePlayerStats(playerName, teamName);
                if (!player.placement) {
                    player.placement = `${placement}${this.getOrdinalSuffix(placement)}`;
                }
            }
        }
    }

    finalizeGamePlacements(winnerTeamName) {
        // Finalize all team placements at game end
        const totalTeams = Object.keys(this.teams).length;
        const allTeams = Object.keys(this.teams);

        // 1. Winner gets 1st place
        if (winnerTeamName && !this.hasPlacement(winnerTeamName, '1st place')) {
            this.recordTeamPlacement(winnerTeamName, 1);
        }

        // 2. Process teams in elimination order (first eliminated = last place)
        for (let i = 0; i < this.eliminationOrder.length; i++) {
            const teamName = this.eliminationOrder[i];
            const placement = totalTeams - i;
            this.recordTeamPlacement(teamName, placement);
        }

        // 3. Handle any remaining teams not eliminated and not winner
        for (const teamName of allTeams) {
            if (teamName !== winnerTeamName && !this.eliminationOrder.includes(teamName)) {
                // These teams survived but didn't win - give them 2nd place (or next available)
                const remainingSlot = 2;
                this.recordTeamPlacement(teamName, remainingSlot);
            }
        }

        this.addLog('All team and player placements finalized', 'info');
    }

    addPlayerToTeam(useBulkInput = false) {
        const playerName = useBulkInput ? '' : document.getElementById('playerName').value.trim();
        const teamName = document.getElementById('teamSelect').value;

        if (!teamName) {
            alert('Please select a team!');
            return;
        }

        let playersToAdd = [];

        if (useBulkInput) {
            const bulkText = document.getElementById('bulkPlayerNames').value.trim();
            if (!bulkText) {
                alert('Please enter player names in the bulk input area!');
                return;
            }
            playersToAdd = this.parseBulkPlayerNames(bulkText);
        } else {
            if (!playerName) {
                alert('Please enter a player name!');
                return;
            }
            playersToAdd = [playerName];
        }

        // Add all players to the selected team
        for (const name of playersToAdd) {
            // Remove player from any existing team
            this.removePlayerFromAllTeams(name);

            // Add player to selected team
            if (!this.teams[teamName]) {
                this.teams[teamName] = {
                    color: this.predefinedTeams[teamName].color,
                    colorCode: this.predefinedTeams[teamName].colorCode,
                    players: []
                };
            }

            if (!this.teams[teamName].players.includes(name)) {
                this.teams[teamName].players.push(name);
            }
        }

        // Clear inputs
        document.getElementById('playerName').value = '';
        if (useBulkInput) {
            document.getElementById('bulkPlayerNames').value = '';
        }

        this.addLog(`Added ${playersToAdd.length} player(s) to ${teamName}`, 'info');
        this.saveTeams();
        this.renderTeams();
        this.updateUI();
    }

    parseBulkPlayerNames(rawNames) {
        // Split by newlines and/or commas, then clean up
        return rawNames
            .split(/[\n,]+/)
            .map(name => name.trim())
            .filter(name => name.length > 0);
    }

    removePlayerFromAllTeams(playerName) {
        for (const teamName in this.teams) {
            const index = this.teams[teamName].players.indexOf(playerName);
            if (index > -1) {
                this.teams[teamName].players.splice(index, 1);

                // Remove team if empty
                if (this.teams[teamName].players.length === 0) {
                    delete this.teams[teamName];
                }
            }
        }
    }

    removePlayer(teamName, playerName) {
        if (!this.teams[teamName]) return;

        const index = this.teams[teamName].players.indexOf(playerName);
        if (index > -1) {
            this.teams[teamName].players.splice(index, 1);
        }

        // Remove team if empty
        if (this.teams[teamName].players.length === 0) {
            delete this.teams[teamName];
        }

        this.saveTeams();
        this.renderTeams();
        this.updateUI();
    }

    clearAllPlayers() {
        // Save current state for undo
        const undoState = {
            action: 'clearAllPlayers',
            teams: JSON.parse(JSON.stringify(this.teams)),
            activityLog: JSON.parse(JSON.stringify(this.activityLog)),
            playerStats: JSON.parse(JSON.stringify(this.playerStats))
        };

        this.undoStack.push(undoState);

        // Get all player names before clearing
        const allPlayerNames = [];
        for (const teamName in this.teams) {
            if (this.teams[teamName].players) {
                allPlayerNames.push(...this.teams[teamName].players);
            }
        }

        // Clear teams
        this.teams = {};

        // Clear player stats
        this.playerStats = {};

        // Clear activity log entries that mention any player
        if (allPlayerNames.length > 0) {
            this.activityLog = this.activityLog.filter(log => {
                const logText = log.message.toLowerCase();
                return !allPlayerNames.some(playerName =>
                    logText.includes(playerName.toLowerCase())
                );
            });
        }

        this.addLog('All players cleared from all teams', 'warning');
        this.saveTeams();
        this.renderTeams();
        this.updateUI();

        // Enable undo button
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn) {
            undoBtn.disabled = false;
        }
    }

    performUndo() {
        if (this.undoStack.length === 0) {
            alert('Nothing to undo!');
            return;
        }

        const undoState = this.undoStack.pop();

        switch (undoState.action) {
            case 'clearAllPlayers':
                // Restore teams
                this.teams = undoState.teams;

                // Restore activity log
                this.activityLog = undoState.activityLog;

                // Restore player stats
                this.playerStats = undoState.playerStats;

                this.addLog('Undo: Restored all players', 'info');
                this.saveTeams();
                this.renderTeams();
                this.updateUI();
                break;

            default:
                console.warn('Unknown undo action:', undoState.action);
        }

        // Disable undo button if stack is empty
        const undoBtn = document.getElementById('undoBtn');
        if (undoBtn && this.undoStack.length === 0) {
            undoBtn.disabled = true;
        }
    }

    changePlayerTeam(playerName, oldTeam, newTeam) {
        // Check if there's an active game with player stats
        const hasStats = this.playerStats[playerName] &&
            (this.playerStats[playerName].kills > 0 ||
                this.playerStats[playerName].deaths > 0 ||
                this.playerStats[playerName].finalKills > 0 ||
                this.playerStats[playerName].bedBreaks > 0);

        let adjustPoints = false;

        if (hasStats && this.gamemode) {
            // Ask user if they want to adjust points
            const message = `${playerName} has stats in the current game.\n\n` +
                `Would you like to recalculate points as if they were always on ${newTeam}?\n\n` +
                `Click OK to adjust points, or Cancel to keep current points.`;
            adjustPoints = confirm(message);
        }

        // Remove from old team
        if (this.teams[oldTeam]) {
            const index = this.teams[oldTeam].players.indexOf(playerName);
            if (index > -1) {
                this.teams[oldTeam].players.splice(index, 1);
            }
            // Remove team if empty
            if (this.teams[oldTeam].players.length === 0) {
                delete this.teams[oldTeam];
            }
        }

        // Add to new team
        if (!this.teams[newTeam]) {
            this.teams[newTeam] = {
                color: this.predefinedTeams[newTeam].color,
                colorCode: this.predefinedTeams[newTeam].colorCode,
                players: []
            };
        }

        if (!this.teams[newTeam].players.includes(playerName)) {
            this.teams[newTeam].players.push(playerName);
        }

        // Update player stats team
        if (this.playerStats[playerName]) {
            this.playerStats[playerName].team = newTeam;
        }

        // Adjust points if requested
        if (adjustPoints && hasStats) {
            this.adjustPointsForTeamChange(playerName, oldTeam, newTeam);
        }

        this.saveTeams();
        this.renderTeams();
        this.updateStats();
        this.updateScoreboard();
        this.addLog(`${playerName} moved from ${oldTeam} to ${newTeam}` + (adjustPoints ? ' (points adjusted)' : ''), 'info');
    }

    adjustPointsForTeamChange(playerName, oldTeam, newTeam) {
        if (!this.playerStats[playerName] || !this.gamemode) return;

        const stats = this.playerStats[playerName];
        const pointSystem = this.pointSystems[this.gamemode];

        // Calculate points to transfer
        let pointsToTransfer = 0;

        if (stats.kills > 0 && pointSystem.kill) {
            pointsToTransfer += stats.kills * pointSystem.kill;
        }
        if (stats.finalKills > 0 && pointSystem.finalKill) {
            pointsToTransfer += stats.finalKills * pointSystem.finalKill;
        }
        if (stats.bedBreaks > 0 && pointSystem.bedBreak) {
            pointsToTransfer += stats.bedBreaks * pointSystem.bedBreak;
        }
        if (stats.placement && pointSystem[`place${stats.placement}`]) {
            pointsToTransfer += pointSystem[`place${stats.placement}`];
        }

        // Remove points from old team
        if (this.scores[oldTeam]) {
            this.scores[oldTeam].score = Math.max(0, this.scores[oldTeam].score - pointsToTransfer);
        }

        // Add points to new team
        if (!this.scores[newTeam]) {
            this.scores[newTeam] = {
                score: 0,
                placements: [],
                kills: [],
                bedBreaks: [],
                events: []
            };
        }
        this.scores[newTeam].score += pointsToTransfer;

        this.addLog(`Transferred ${pointsToTransfer} points from ${oldTeam} to ${newTeam}`, 'success');
    }

    renderTeams() {
        const teamsGrid = document.getElementById('teamsGrid');
        if (!teamsGrid) return;

        if (Object.keys(this.teams).length === 0) {
            teamsGrid.innerHTML = `
                <div class="teams-empty-state">
                    <h3>No players assigned yet</h3>
                    <p>Add players to teams using the form above!</p>
                </div>
            `;
            return;
        }

        // Sort teams by name
        const sortedTeams = Object.entries(this.teams).sort((a, b) => a[0].localeCompare(b[0]));

        let html = '';
        for (const [teamName, teamData] of sortedTeams) {
            html += `
                <div class="team-card" style="border-left: 4px solid ${teamData.color}">
                    <div class="team-card-header">
                        <div class="team-card-name" style="color: ${teamData.color}">
                            ${teamName}
                        </div>
                        <span class="team-color-code">${teamData.colorCode}</span>
                    </div>
                    <div class="team-card-players">
                        ${this.renderPlayerList(teamName, teamData.players)}
                    </div>
                    <div class="team-card-stats">
                        ${teamData.players.length} player${teamData.players.length !== 1 ? 's' : ''}
                    </div>
                </div>
            `;
        }

        teamsGrid.innerHTML = html;

        // Attach remove player event listeners
        document.querySelectorAll('.remove-player-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const teamName = e.target.dataset.team;
                const playerName = e.target.dataset.player;
                this.removePlayer(teamName, playerName);
            });
        });

        // Attach team change event listeners
        document.querySelectorAll('.change-team-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const playerName = e.target.dataset.player;
                const currentTeam = e.target.dataset.currentTeam;
                const newTeam = e.target.value;

                if (currentTeam !== newTeam) {
                    this.changePlayerTeam(playerName, currentTeam, newTeam);
                }
            });
        });
    }

    renderPlayerList(teamName, players) {
        if (players.length === 0) {
            return '<p class="no-players">No players</p>';
        }

        let html = '<div class="player-list">';
        for (const player of players) {
            // Build team options for dropdown
            let teamOptions = '';
            for (const [tName, tData] of Object.entries(this.predefinedTeams)) {
                const selected = tName === teamName ? 'selected' : '';
                teamOptions += `<option value="${tName}" ${selected}>${tName}</option>`;
            }

            html += `
                <div class="player-item">
                    <div class="player-item-left">
                        <span class="player-name">${this.escapeHtml(player)}</span>
                        <select class="change-team-select" data-player="${this.escapeHtml(player)}" data-current-team="${teamName}">
                            ${teamOptions}
                        </select>
                    </div>
                    <button class="remove-player-btn" data-team="${teamName}" data-player="${this.escapeHtml(player)}" title="Remove player">×</button>
                </div>
            `;
        }
        html += '</div>';
        return html;
    }

    renderStats() {
        this.renderPlayerStats();
        this.renderGameHistory();
        this.renderOverallStats();
    }

    renderPlayerStats() {
        const playerStats = document.getElementById('playerStats');
        if (!playerStats) return;

        if (Object.keys(this.playerStats).length === 0) {
            playerStats.innerHTML = '<p class=\"empty-state\">No player data yet! Process some chat to see stats.</p>';
            return;
        }

        let html = '<div class=\"player-stats-grid\">';
        const sortedPlayers = Object.entries(this.playerStats)
            .filter(([playerName]) => this.findPlayerTeam(playerName)) // Only show registered players
            .sort((a, b) => {
                // Sort by: eliminated (false first), then by kills, then by deaths (fewer is better)
                if (a[1].eliminated !== b[1].eliminated) return a[1].eliminated ? 1 : -1;
                if (b[1].kills !== a[1].kills) return b[1].kills - a[1].kills;
                return a[1].deaths - b[1].deaths;
            });

        for (const [playerName, data] of sortedPlayers) {
            const teamColor = this.teams[data.team]?.color || '#888';
            const eliminatedClass = data.eliminated ? 'eliminated' : '';

            html += `
                <div class=\"player-stat-card ${eliminatedClass}\" style=\"border-left: 4px solid ${teamColor}\">
                    <h3>${this.escapeHtml(playerName)}</h3>
                    <div class=\"stat-badge\" style=\"background: ${teamColor}\">${data.team}</div>
                    <div class=\"stat-row\">
                        <span>Status:</span>
                        <span>${data.eliminated ? 'G�� Eliminated' : 'G�� Active'}</span>
                    </div>
                    <div class=\"stat-row\">
                        <span>Kills:</span>
                        <span>${data.kills}</span>
                    </div>
                    <div class=\"stat-row\">
                        <span>Deaths:</span>
                        <span>${data.deaths}</span>
                    </div>
                    <div class=\"stat-row\">
                        <span>Final Kills:</span>
                        <span>${data.finalKills}</span>
                    </div>
                    ${data.bedBreaks > 0 ? `
                    <div class=\"stat-row\">
                        <span>Bed Breaks:</span>
                        <span>${data.bedBreaks}</span>
                    </div>
                    ` : ''}
                    ${data.placement ? `
                    <div class=\"stat-row highlight\">
                        <span>Placement:</span>
                        <span>${data.placement}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        }
        html += '</div>';

        playerStats.innerHTML = html;
    }

    renderGameHistory() {
        const gameHistory = document.getElementById('gameHistory');
        if (!gameHistory) return;

        if (this.gameHistory.length === 0) {
            gameHistory.innerHTML = '<p class=\"empty-state\">No completed games yet! Start a new game after playing to save it to history.</p>';
            return;
        }

        let html = '';
        const sortedGames = [...this.gameHistory].reverse();

        for (const game of sortedGames) {
            const startDate = new Date(game.startTime);
            const endDate = new Date(game.endTime);
            const duration = Math.round((endDate - startDate) / 60000);
            const isEditing = String(this.editingGameId) === String(game.id);
            const sortedTeams = Object.entries(game.scores).sort((a, b) => b[1].score - a[1].score);
            const winner = sortedTeams[0];

            html += `
                <div class=\"game-history-card ${isEditing ? 'editing' : ''}\" data-game-id=\"${game.id}\">
                    <div class=\"game-header\">
                        <h3>=�ī ${game.gamemode}</h3>
                        <span class=\"game-date\">${startDate.toLocaleString()}</span>
                    </div>
                    <div class=\"game-info\">
                        <span>Duration: ${duration} min</span>
                        <span>Winner: ${winner[0]} (${winner[1].score} pts)</span>
                    </div>
                    
                    <details class=\"game-details\">
                        <summary>View Full Scores & Player Stats</summary>
                        
                        <div class=\"game-scores\">
                            <div class=\"game-scores-header\">
                                <h4>Team Scores</h4>
                                ${isEditing ? `
                                <div class=\"game-score-editor-actions\">
                                    <button type=\"button\" class=\"btn btn-success btn-small\" data-action=\"save-game-scores\" data-game-id=\"${game.id}\">Save Scores</button>
                                    <button type=\"button\" class=\"btn btn-secondary btn-small\" data-action=\"cancel-game-scores\" data-game-id=\"${game.id}\">Cancel</button>
                                </div>
                                ` : `
                                <button type=\"button\" class=\"btn btn-info btn-small\" data-action=\"edit-game-scores\" data-game-id=\"${game.id}\">Edit Scores</button>
                                `}
                            </div>
                            ${isEditing ? '<p class=\"game-score-editor-help\">Adjust the saved score for any team in this game. Totals refresh as soon as you save.</p>' : ''}
                            ${sortedTeams.map(([teamName, data], index) => {
                const teamColor = this.teams[teamName]?.color || '#888';
                return `
                                    <div class=\"score-row\" style=\"border-left: 3px solid ${teamColor}\">
                                        <span class=\"rank\">#${index + 1}</span>
                                        <span class=\"team-name\">${teamName}</span>
                                        ${isEditing ? `
                                            <input type=\"number\" class=\"score-editor-input\" data-team=\"${teamName}\" value=\"${data.score}\" min=\"0\" />
                                        ` : `<span class=\"points\">${data.score} pts</span>`}
                                    </div>
                                `;
            }).join('')}
                        </div>

                        <div class=\"game-player-stats\">
                            <h4>Player Performance</h4>
                            <div class=\"player-stats-grid\">
                                ${Object.entries(game.playerStats).map(([playerName, data]) => {
                const teamColor = this.teams[data.team]?.color || '#888';
                return `
                                        <div class=\"player-stat-card mini\" style=\"border-left: 4px solid ${teamColor}\">
                                            <strong>${this.escapeHtml(playerName)}</strong>
                                            <div class=\"stat-badge\" style=\"background: ${teamColor}\">${data.team}</div>
                                            <div class=\"mini-stats\">
                                                <span>K: ${data.kills}</span>
                                                <span>D: ${data.deaths}</span>
                                                <span>FK: ${data.finalKills}</span>
                                                ${data.bedBreaks > 0 ? `<span>BB: ${data.bedBreaks}</span>` : ''}
                                                ${data.placement ? `<span>=��� #${data.placement}</span>` : ''}
                                            </div>
                                        </div>
                                    `;
            }).join('')}
                            </div>
                        </div>
                    </details>
                </div>
            `;
        }

        gameHistory.innerHTML = html;
    }

    renderOverallStats() {
        const overallStats = document.getElementById('overallStats');
        if (!overallStats) return;

        if (this.gameHistory.length === 0) {
            overallStats.innerHTML = '<p class=\"empty-state\">No games played yet!</p>';
            return;
        }

        // Aggregate scores per player per gamemode
        const playerScores = this.aggregatePlayerScores();

        // Filter to only show registered players
        const registeredPlayerScores = Object.entries(playerScores)
            .filter(([playerName]) => this.findPlayerTeam(playerName));

        if (registeredPlayerScores.length === 0) {
            overallStats.innerHTML = '<p class=\"empty-state\">No registered player data yet!</p>';
            return;
        }

        // Sort by total points descending
        const sortedPlayers = registeredPlayerScores.sort((a, b) => b[1].totalPoints - a[1].totalPoints);

        let html = `
            <div class=\"tutorial-tip\">
                <strong>G�� Tutorial Tip:</strong> You can edit the per-gamemode scores below to fix bugs or make arbitrary point adjustments. Just click the score value next to each gamemode, change it, and press Enter or click outside to save.
            </div>

            <div class=\"overall-summary\">
                <div class=\"summary-card\">
                    <div class=\"summary-value\">${this.gameHistory.length}</div>
                    <div class=\"summary-label\">Total Games</div>
                </div>
                <div class=\"summary-card\">
                    <div class=\"summary-value\">${sortedPlayers.length}</div>
                    <div class=\"summary-label\">Registered Players</div>
                </div>
            </div>

            <div class=\"player-leaderboard\">
                <h3>Player Leaderboard (Total Points)</h3>
                ${sortedPlayers.map(([playerName, data], index) => {
            const teamName = this.findPlayerTeam(playerName);
            const teamColor = this.teams[teamName]?.color || '#888';
            const gamemodeBreakdowns = Object.entries(data.byGamemode).map(([mode, points]) => {
                return `<span class=\"gamemode-score\" data-player=\"${this.escapeHtml(playerName)}\" data-gamemode=\"${mode}\" contenteditable=\"true\" data-original=\"${points}\">${points}</span> <span class=\"gamemode-label\">${mode}</span>`;
            }).join(', ');

            return `
                        <div class=\"player-leaderboard-card\" style=\"border-left: 4px solid ${teamColor}\">
                            <div class=\"leaderboard-rank\">#${index + 1}</div>
                            <div class=\"leaderboard-player-info\">
                                <h3>${this.escapeHtml(playerName)}</h3>
                                <div class=\"stat-badge\" style=\"background: ${teamColor}\">${teamName}</div>
                            </div>
                            <div class=\"leaderboard-total\">${data.totalPoints} pts</div>
                            <div class=\"leaderboard-breakdowns\">
                                ${gamemodeBreakdowns || '<em>No scores yet</em>'}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;

        overallStats.innerHTML = html;

        // Add event listeners for editable score fields
        document.querySelectorAll('.gamemode-score').forEach(el => {
            el.addEventListener('blur', (e) => this.savePlayerGamemodeScore(e));
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
            });
        });
    }

    handleGameHistoryActions(event) {
        const action = event.target.dataset.action;
        if (!action) return;

        const gameId = event.target.dataset.gameId;

        if (action === 'edit-game-scores') {
            this.editingGameId = gameId;
            this.renderStats();
        } else if (action === 'save-game-scores') {
            this.saveEditedGameScores(gameId);
        } else if (action === 'cancel-game-scores') {
            this.editingGameId = null;
            this.renderStats();
        }
    }

    saveEditedGameScores(gameId) {
        const gameIndex = this.gameHistory.findIndex(g => String(g.id) === String(gameId));
        if (gameIndex === -1) return;

        const card = document.querySelector(`.game-history-card[data-game-id=\"${gameId}\"]`);
        if (!card) return;

        const updatedScores = { ...this.gameHistory[gameIndex].scores };
        card.querySelectorAll('.score-editor-input').forEach(input => {
            const teamName = input.dataset.team;
            const nextScore = parseInt(input.value, 10) || 0;
            if (updatedScores[teamName]) {
                updatedScores[teamName].score = nextScore;
            }
        });

        this.gameHistory[gameIndex].scores = updatedScores;
        this.editingGameId = null;
        this.syncPersistentData();
        this.renderStats();
        this.addLog(`Updated saved scores for ${this.gameHistory[gameIndex].gamemode}`, 'success');
    }

    aggregatePlayerScores() {
        const playerScores = {};

        for (const game of this.gameHistory) {
            const sortedTeams = Object.entries(game.scores).sort((a, b) => b[1].score - a[1].score);

            for (const [teamName, teamScore] of sortedTeams) {
                const team = this.teams[teamName];
                if (!team || !team.players) continue;

                // Divide team score among players
                const playersInTeam = team.players.filter(p => game.playerStats[p]);
                if (playersInTeam.length === 0) continue;

                const pointsPerPlayer = Math.floor(teamScore.score / playersInTeam.length);

                for (const playerName of playersInTeam) {
                    if (!playerScores[playerName]) {
                        playerScores[playerName] = {
                            totalPoints: 0,
                            byGamemode: {}
                        };
                    }

                    playerScores[playerName].totalPoints += pointsPerPlayer;

                    if (!playerScores[playerName].byGamemode[game.gamemode]) {
                        playerScores[playerName].byGamemode[game.gamemode] = 0;
                    }
                    playerScores[playerName].byGamemode[game.gamemode] += pointsPerPlayer;
                }
            }
        }

        return playerScores;
    }

    savePlayerGamemodeScore(event) {
        const el = event.target;
        const playerName = el.dataset.player;
        const gamemode = el.dataset.gamemode;
        const originalScore = parseInt(el.dataset.original, 10);
        const newScore = parseInt(el.textContent.trim(), 10);

        if (isNaN(newScore) || newScore < 0) {
            el.textContent = originalScore;
            return;
        }

        if (newScore === originalScore) return;

        // Update game history to reflect the new score
        const scoreDelta = newScore - originalScore;

        for (const game of this.gameHistory) {
            if (game.gamemode !== gamemode) continue;

            const teamName = this.findPlayerTeam(playerName);
            if (!teamName || !game.scores[teamName]) continue;

            const team = this.teams[teamName];
            if (!team || !team.players || !team.players.includes(playerName)) continue;

            // Adjust team score by the delta
            game.scores[teamName].score += scoreDelta;
        }

        this.syncPersistentData();
        el.dataset.original = newScore;
        this.addLog(`Updated ${playerName}'s ${gamemode} score to ${newScore}`, 'success');
        this.renderStats();
    }

    getOrCreatePlayerStats(playerName, teamName) {
        if (!this.playerStats[playerName]) {
            this.playerStats[playerName] = {
                team: teamName,
                kills: 0,
                deaths: 0,
                finalKills: 0,
                bedBreaks: 0,
                eliminated: false,
                placement: null
            };
        }
        return this.playerStats[playerName];
    }

    findPlayerTeam(playerName) {
        for (const [teamName, teamData] of Object.entries(this.teams)) {
            if (teamData.players && teamData.players.includes(playerName)) {
                return teamName;
            }
        }
        return null;
    }

    awardPoints(teamName, eventType) {
        if (!this.gamemode || !this.pointSystems[this.gamemode]) return;

        const points = this.pointSystems[this.gamemode][eventType];
        if (points === undefined) return;

        if (!this.scores[teamName]) {
            this.scores[teamName] = {
                score: 0,
                placements: [],
                kills: [],
                bedBreaks: [],
                events: []
            };
        }

        this.scores[teamName].score += points;
        this.scores[teamName].events.push({
            type: eventType,
            points: points,
            time: new Date().toISOString()
        });
    }

    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
    }

    stripColorCodes(text) {
        return text.replace(/§[0-9a-fk-or]/gi, '').trim();
    }

    updateUI() {
        this.updateStats();
        this.updateScoreboard();
        this.updateActivityLog();
        document.getElementById('currentGamemode').textContent = this.gamemode || 'None';
    }

    updateStats() {
        const teamCount = Object.keys(this.teams).length;
        const uniquePlayers = this.getLoggedPlayerCount();

        // Generate team placements summary
        let placementsSummary = '-';
        if (Object.keys(this.scores).length > 0) {
            const sortedTeams = Object.entries(this.scores).sort((a, b) => b[1].score - a[1].score);
            const teamsWithPoints = sortedTeams.filter(([_, data]) => data.score > 0);
            if (teamsWithPoints.length > 0) {
                placementsSummary = teamsWithPoints.slice(0, 3).map(([team, data]) =>
                    `${team.substring(0, 3)}:${data.score}`
                ).join(' | ');
            }
        }

        this.animateNumber('totalTeams', teamCount);
        this.animateNumber('totalPlayers', uniquePlayers);
        document.getElementById('teamPlacements').textContent = placementsSummary;
        document.getElementById('currentGamemode').textContent = this.gamemode || 'None';
    }

    getLoggedPlayerCount() {
        const loggedPlayers = new Set();

        Object.values(this.teams).forEach(team => {
            if (!team.players) return;
            team.players.forEach(player => loggedPlayers.add(player));
        });

        Object.keys(this.playerStats).forEach(player => loggedPlayers.add(player));

        return loggedPlayers.size;
    }

    updateScoreboard() {
        const scoreboard = document.getElementById('scoreboard');

        if (Object.keys(this.scores).length === 0) {
            scoreboard.innerHTML = '<p class="empty-state">No scores yet. Start a new game and process chat text!</p>';
            return;
        }

        // Sort teams by score
        const sortedTeams = Object.entries(this.scores).sort((a, b) => b[1].score - a[1].score);

        let html = '';
        sortedTeams.forEach(([teamName, data], index) => {
            const teamInfo = this.teams[teamName] || { color: '#FFFFFF' };
            const rank = index + 1;
            const playerCount = teamInfo.players ? teamInfo.players.length : 0;

            html += `
                <div class="score-item">
                    <div class="score-rank">${rank}</div>
                    <div class="score-info">
                        <div class="team-name" style="color: ${teamInfo.color}">
                            ${teamName}
                        </div>
                        <div class="team-stats">
                            ${playerCount} player${playerCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <div class="score-value">${data.score} pts</div>
                </div>
            `;
        });

        scoreboard.innerHTML = html;
    }

    updateActivityLog() {
        const log = document.getElementById('activityLog');

        if (this.activityLog.length === 0) {
            log.innerHTML = '<p class="empty-state">Activity will appear here...</p>';
            return;
        }

        const recentLogs = this.activityLog.slice(-50).reverse();
        let html = '';

        recentLogs.forEach(entry => {
            html += `
                <div class="log-entry ${entry.type || ''}">
                    <span class="log-time">${new Date(entry.time).toLocaleTimeString()}</span>
                    <span class="log-message">${entry.message}</span>
                </div>
            `;
        });

        log.innerHTML = html;
    }

    addLog(message, type = 'info') {
        this.activityLog.push({
            message: message,
            type: type,
            time: new Date().toISOString()
        });
        this.updateActivityLog();
    }

    loadTeams() {
        const saved = localStorage.getItem('hive_teams');
        if (saved) {
            this.teams = JSON.parse(saved);
        }
    }

    saveTeams() {
        localStorage.setItem('hive_teams', JSON.stringify(this.teams));
    }

    saveData() {
        const data = {
            teams: this.teams,
            currentGame: this.currentGame,
            scores: this.scores,
            playerStats: this.playerStats,
            eliminationOrder: this.eliminationOrder,
            playerEliminationOrder: this.playerEliminationOrder,
            gameHistory: this.gameHistory,
            playersFinished: this.playersFinished,
            teamsFullyFinished: this.teamsFullyFinished,
            gamemode: this.gamemode,
            saveDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hive-event-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.hasUnsavedChanges = false;
        this.addLog('Data saved to JSON file', 'success');
    }

    importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Restore all data
                if (data.teams) this.teams = data.teams;
                if (data.currentGame) this.currentGame = data.currentGame;
                if (data.scores) this.scores = data.scores;
                if (data.playerStats) this.playerStats = data.playerStats;
                if (data.eliminationOrder) this.eliminationOrder = data.eliminationOrder;
                if (data.playerEliminationOrder) this.playerEliminationOrder = data.playerEliminationOrder;
                if (data.gameHistory) this.gameHistory = data.gameHistory;
                if (data.playersFinished) this.playersFinished = data.playersFinished;
                if (data.teamsFullyFinished) this.teamsFullyFinished = data.teamsFullyFinished;
                if (data.gamemode) this.gamemode = data.gamemode;

                // Update UI to reflect loaded data
                this.syncPersistentData();
                this.updateUI();
                this.renderTeams();
                this.renderStats();

                alert('Data loaded successfully!');
                this.addLog('Data imported from JSON file', 'success');
            } catch (error) {
                alert('Error loading data: Invalid JSON file format');
                console.error('Import error:', error);
                this.addLog('Failed to import data', 'error');
            }
        };
        reader.readAsText(file);

        // Reset file input
        event.target.value = '';
    }

    exportJSON() {
        const data = {
            teams: this.teams,
            currentGame: this.currentGame,
            scores: this.scores,
            playerStats: this.playerStats,
            eliminationOrder: this.eliminationOrder,
            playerEliminationOrder: this.playerEliminationOrder,
            gameHistory: this.gameHistory,
            playersFinished: this.playersFinished,
            teamsFullyFinished: this.teamsFullyFinished,
            gamemode: this.gamemode,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hive-event-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.addLog('Data exported to JSON file', 'success');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Settings Management Methods
    loadSettings() {
        const saved = localStorage.getItem('hive_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                if (settings.pointSystems) {
                    this.pointSystems = settings.pointSystems;
                }
                if (settings.gamemodeFeatures) {
                    this.gamemodeFeatures = settings.gamemodeFeatures;
                }
                if (settings.detectionPatterns) {
                    this.detectionPatterns = settings.detectionPatterns;
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                this.resetSettings();
            }
        } else {
            // Initialize default detection patterns
            this.detectionPatterns = {
                teamElimination: '-+ [PLAYER] has been ELIMINATED',
                winner: '-+ [PLAYER] is the WINNER',
                killPrefix: '-�c-�l-+',
                bedBreak: "[PLAYER] destroyed [PLAYER]'s bed",
                individualFinish: "[PLAYER] finished in (\\d+)(?:st|nd|rd|th) place"
            };
        }
    }

    saveSettings() {
        // Gather points from UI
        const selectedGamemode = document.getElementById('settingsGamemode').value;
        const pointInputs = document.querySelectorAll('.point-item input[type="number"]');

        pointInputs.forEach(input => {
            const action = input.dataset.action;
            const value = parseInt(input.value) || 0;
            if (this.pointSystems[selectedGamemode]) {
                this.pointSystems[selectedGamemode][action] = value;
            }
        });

        // Gather detection patterns
        this.detectionPatterns = {
            teamElimination: document.getElementById('patternTeamElim').value,
            winner: document.getElementById('patternWinner').value,
            killPrefix: document.getElementById('patternKillPrefix').value,
            bedBreak: document.getElementById('patternBedBreak').value,
            individualFinish: document.getElementById('patternIndividualFinish').value
        };

        // Save to localStorage
        const settings = {
            pointSystems: this.pointSystems,
            gamemodeFeatures: this.gamemodeFeatures,
            detectionPatterns: this.detectionPatterns
        };
        localStorage.setItem('hive_settings', JSON.stringify(settings));

        alert('Settings saved successfully!');
        this.addLog('Settings updated', 'success');
    }

    resetSettings() {
        // Reset to default point systems
        this.pointSystems = {
            'DeathRun': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'First full team finish': 1
            },
            'SkyWars': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1
            },
            'BlockDrop': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'Last team standing': 1
            },
            'BedWars': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1,
                'Bed Break': 1
            },
            'Block Party': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'Last team standing': 1
            },
            'Gravity': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                '4th place': 1,
                '5th place': 1,
                'First full team finish': 1
            },
            'Survival Games': {
                '1st place': 4,
                '2nd place': 3,
                '3rd place': 2,
                'Kill': 1
            }
        };

        // Reset detection patterns
        this.detectionPatterns = {
            teamElimination: '-+ [PLAYER] has been ELIMINATED',
            winner: '-+ [PLAYER] is the WINNER',
            killPrefix: '-�c-�l-+',
            bedBreak: "[PLAYER] destroyed [PLAYER]'s bed",
            individualFinish: "[PLAYER] finished in (\\d+)(?:st|nd|rd|th) place"
        };

        // Reset gamemode features
        this.gamemodeFeatures = {
            'DeathRun': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true },
            'SkyWars': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false },
            'BlockDrop': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false },
            'BedWars': { kills: true, bedBreaks: true, individualFinish: false, teamFinish: false },
            'Block Party': { kills: false, bedBreaks: false, individualFinish: false, teamFinish: false },
            'Gravity': { kills: false, bedBreaks: false, individualFinish: true, teamFinish: true },
            'Survival Games': { kills: true, bedBreaks: false, individualFinish: false, teamFinish: false }
        };

        // Save and refresh UI
        const settings = {
            pointSystems: this.pointSystems,
            gamemodeFeatures: this.gamemodeFeatures,
            detectionPatterns: this.detectionPatterns
        };
        localStorage.setItem('hive_settings', JSON.stringify(settings));

        this.populatePointsSettings();
        this.populateDetectionPatterns();

        alert('Settings reset to defaults!');
        this.addLog('Settings reset to defaults', 'warning');
    }

    populatePointsSettings() {
        const selectedGamemode = document.getElementById('settingsGamemode').value;
        const pointsContainer = document.getElementById('pointsSettings');

        if (!this.pointSystems[selectedGamemode]) {
            pointsContainer.innerHTML = '<p class="empty-state">Invalid gamemode selected</p>';
            return;
        }

        const points = this.pointSystems[selectedGamemode];

        let html = `<h3>Point Values for ${selectedGamemode}</h3>`;

        for (const [action, value] of Object.entries(points)) {
            html += `
                <div class="point-item">
                    <label>${action}</label>
                    <input type="number" data-action="${action}" value="${value}" min="0" max="100">
                </div>
            `;
        }

        pointsContainer.innerHTML = html;
    }

    populateDetectionPatterns() {
        if (!this.detectionPatterns) {
            this.detectionPatterns = {
                teamElimination: '-+ [PLAYER] has been ELIMINATED',
                winner: '-+ [PLAYER] is the WINNER',
                killPrefix: '-�c-�l-+',
                bedBreak: "[PLAYER] destroyed [PLAYER]'s bed",
                individualFinish: "[PLAYER] finished in (\\d+)(?:st|nd|rd|th) place"
            };
        }

        document.getElementById('patternTeamElim').value = this.detectionPatterns.teamElimination;
        document.getElementById('patternWinner').value = this.detectionPatterns.winner;
        document.getElementById('patternKillPrefix').value = this.detectionPatterns.killPrefix;
        document.getElementById('patternBedBreak').value = this.detectionPatterns.bedBreak;
        document.getElementById('patternIndividualFinish').value = this.detectionPatterns.individualFinish || "[PLAYER] finished in (\\d+)(?:st|nd|rd|th) place";

        this.updatePatternVisibility();
    }

    updatePatternVisibility() {
        const selectedGamemode = document.getElementById('settingsGamemode').value;
        const features = this.gamemodeFeatures[selectedGamemode];

        if (!features) return;

        // Show/hide patterns based on gamemode features
        const killGroup = document.getElementById('patternKillGroup');
        const bedBreakGroup = document.getElementById('patternBedBreakGroup');
        const individualFinishGroup = document.getElementById('patternIndividualFinishGroup');

        if (killGroup) {
            killGroup.classList.toggle('hidden', !features.kills);
        }
        if (bedBreakGroup) {
            bedBreakGroup.classList.toggle('hidden', !features.bedBreaks);
        }
        if (individualFinishGroup) {
            individualFinishGroup.classList.toggle('hidden', !features.individualFinish);
        }
    }

    addNewGamemode() {
        const gamemodeName = prompt('Enter new gamemode name:');
        if (!gamemodeName || gamemodeName.trim() === '') return;

        const trimmedName = gamemodeName.trim();

        if (this.pointSystems[trimmedName]) {
            alert('Gamemode already exists!');
            return;
        }

        // Create default point system
        this.pointSystems[trimmedName] = {
            '1st place': 4,
            '2nd place': 3,
            '3rd place': 2
        };

        // Create default features
        this.gamemodeFeatures[trimmedName] = {
            kills: false,
            bedBreaks: false,
            individualFinish: false,
            teamFinish: false
        };

        // Update both gamemode dropdowns
        this.updateGamemodeDropdowns();

        // Select the new gamemode in settings
        document.getElementById('settingsGamemode').value = trimmedName;

        // Update UI
        this.populatePointsSettings();
        this.updatePatternVisibility();

        alert(`Gamemode "${trimmedName}" created! Configure its settings and save.`);
    }

    deleteGamemode() {
        const selectedGamemode = document.getElementById('settingsGamemode').value;

        // Prevent deleting default gamemodes
        const defaultModes = ['DeathRun', 'SkyWars', 'BlockDrop', 'BedWars', 'Block Party', 'Gravity', 'Survival Games'];
        if (defaultModes.includes(selectedGamemode)) {
            alert('Cannot delete default gamemodes!');
            return;
        }

        if (!confirm(`Delete gamemode "${selectedGamemode}"? This cannot be undone.`)) {
            return;
        }

        // Remove from systems
        delete this.pointSystems[selectedGamemode];
        delete this.gamemodeFeatures[selectedGamemode];

        // Update both gamemode dropdowns
        this.updateGamemodeDropdowns();

        // Update UI
        this.populatePointsSettings();
        this.updatePatternVisibility();

        // Save
        this.saveSettings();

        alert(`Gamemode "${selectedGamemode}" deleted!`);
    }

    exportSettingsJSON() {
        const settings = {
            pointSystems: this.pointSystems,
            gamemodeFeatures: this.gamemodeFeatures,
            detectionPatterns: this.detectionPatterns
        };

        const dataStr = JSON.stringify(settings, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `hive-settings-${Date.now()}.json`;
        link.click();

        URL.revokeObjectURL(url);
        this.addLog('Settings exported', 'success');
    }

    importSettingsJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const settings = JSON.parse(e.target.result);

                if (settings.pointSystems) {
                    this.pointSystems = settings.pointSystems;
                }
                if (settings.gamemodeFeatures) {
                    this.gamemodeFeatures = settings.gamemodeFeatures;
                }
                if (settings.detectionPatterns) {
                    this.detectionPatterns = settings.detectionPatterns;
                }

                localStorage.setItem('hive_settings', JSON.stringify(settings));

                // Update gamemode dropdowns
                this.updateGamemodeDropdowns();

                this.populatePointsSettings();
                this.populateDetectionPatterns();

                alert('Settings imported successfully!');
                this.addLog('Settings imported', 'success');
            } catch (error) {
                alert('Error importing settings: Invalid file format');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);

        // Reset file input
        event.target.value = '';
    }

    updateGamemodeDropdowns() {
        // Update main gamemode selector
        const mainSelect = document.getElementById('gamemode');
        if (mainSelect) {
            const currentValue = mainSelect.value;
            mainSelect.innerHTML = '<option value="">-- Choose a Gamemode --</option>';

            Object.keys(this.pointSystems).forEach(gamemode => {
                const option = document.createElement('option');
                option.value = gamemode;
                option.textContent = gamemode;
                mainSelect.appendChild(option);
            });

            if (currentValue && this.pointSystems[currentValue]) {
                mainSelect.value = currentValue;
            }
        }

        // Update settings gamemode selector
        const settingsSelect = document.getElementById('settingsGamemode');
        if (settingsSelect) {
            const currentValue = settingsSelect.value;
            settingsSelect.innerHTML = '';

            Object.keys(this.pointSystems).forEach(gamemode => {
                const option = document.createElement('option');
                option.value = gamemode;
                option.textContent = gamemode;
                settingsSelect.appendChild(option);
            });

            if (currentValue && this.pointSystems[currentValue]) {
                settingsSelect.value = currentValue;
            }
        }
    }

    // Check if there's data worth saving
    hasDataToSave() {
        return Object.keys(this.playerStats).length > 0 ||
            Object.keys(this.scores).length > 0 ||
            this.gameHistory.length > 0;
    }

    // Emergency save to browser cache (for crash recovery)
    emergencySave() {
        try {
            const emergencyData = {
                teams: this.teams,
                currentGame: this.currentGame,
                scores: this.scores,
                playerStats: this.playerStats,
                eliminationOrder: this.eliminationOrder,
                playerEliminationOrder: this.playerEliminationOrder,
                gameHistory: this.gameHistory,
                playersFinished: this.playersFinished,
                teamsFullyFinished: this.teamsFullyFinished,
                gamemode: this.gamemode,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('hive_emergency_backup', JSON.stringify(emergencyData));
        } catch (error) {
            console.error('Emergency save failed:', error);
        }
    }

    // Load emergency save (on app start, in case of previous crash)
    loadEmergencySave() {
        try {
            const saved = localStorage.getItem('hive_emergency_backup');
            if (saved) {
                const data = JSON.parse(saved);
                const savedTime = new Date(data.timestamp);
                const now = new Date();
                const hoursSince = (now - savedTime) / (1000 * 60 * 60);

                // Only offer recovery if the save is less than 24 hours old
                if (hoursSince < 24 && this.hasDataInBackup(data)) {
                    const message = `Found an emergency backup from ${savedTime.toLocaleString()}. Would you like to restore it?`;
                    if (confirm(message)) {
                        if (data.teams) this.teams = data.teams;
                        if (data.currentGame) this.currentGame = data.currentGame;
                        if (data.scores) this.scores = data.scores;
                        if (data.playerStats) this.playerStats = data.playerStats;
                        if (data.eliminationOrder) this.eliminationOrder = data.eliminationOrder;
                        if (data.playerEliminationOrder) this.playerEliminationOrder = data.playerEliminationOrder;
                        if (data.gameHistory) this.gameHistory = data.gameHistory;
                        if (data.playersFinished) this.playersFinished = data.playersFinished;
                        if (data.teamsFullyFinished) this.teamsFullyFinished = data.teamsFullyFinished;
                        if (data.gamemode) this.gamemode = data.gamemode;

                        this.addLog('Emergency backup restored', 'success');
                        alert('Your data has been recovered from the emergency backup!');
                    }
                }
            }
        } catch (error) {
            console.error('Error loading emergency save:', error);
        }
    }

    hasDataInBackup(data) {
        return (data.playerStats && Object.keys(data.playerStats).length > 0) ||
            (data.scores && Object.keys(data.scores).length > 0) ||
            (data.gameHistory && data.gameHistory.length > 0);
    }

    // Animate number changes
    animateNumber(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const currentValue = parseInt(element.textContent) || 0;
        if (currentValue === newValue) return;

        // Add animation class
        element.classList.add('updating');

        // Animate the number counting up/down
        const duration = 500;
        const steps = 20;
        const increment = (newValue - currentValue) / steps;
        let current = currentValue;
        let step = 0;

        const interval = setInterval(() => {
            step++;
            current += increment;

            if (step >= steps) {
                element.textContent = newValue;
                clearInterval(interval);

                // Remove animation class after animation completes
                setTimeout(() => {
                    element.classList.remove('updating');
                }, 500);
            } else {
                element.textContent = Math.round(current);
            }
        }, duration / steps);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.scorer = new HiveEventScorer();
});
