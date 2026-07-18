# Hive Event Scorer

This is an advanced chat interpreter that allows Hive Events to automatically calculate and score their events!

### Features
- Team management and scoring
- Automatically calculate event stats
- Score editor
- Customizable settings
- Clean and intuitive interface

### How To Use
1. Open `index.html` in your web browser after downloading the project (no server or build step required)
2. Navigate to the **Teams** tab to add and manage team rosters (assign each in-game player to a team)
3. On the **Scorer** tab, pick the gamemode and paste the chat log, then **Process Chat**
4. View scores and per-player performance on the **Stats** tab
5. Adjust point values, detection, and your own IGN on the **Settings** tab

> Set **My IGN** in Settings so first-person log lines ("You killed ...", "You finished in 1st place")
> are attributed to you. Leave it blank to skip those lines.

### Supported gamemodes
BedWars, SkyWars, Survival Games, DeathRun, Gravity, Block Drop, and Block Party — each interpreted by a
dedicated parser tuned to The Hive's real chat formats. Combat kills are detected structurally, so any
flavour kill verb ("rolled ... beyond space and time", "ten hearted", "silenced", ...) is handled
automatically without a hard-coded list.

### Statistics & exports
The Statistics tab shows cumulative event results: **event standings** (team totals, each listing its
players' totals) and a compact **all-players** list — click any player to open a modal with their full
per-game breakdown and placements. (The live current game and point record stay on the Scorer tab.)

**Export PNG** opens a dialog where you type the event title and tweak team display names, then download two
shareable posters — player standings and event winners — drawn on a canvas with no external libraries.
Manual score edits are made per game via "Edit Scores" in Game History. **Wipe Statistics** clears all
games/scores/player stats but keeps your teams (teams are only cleared from the Teams tab).

### Importing logs
Drag a `.txt` chat log onto the window: the gamemode is inferred from the filename (e.g. `bedwars.txt`,
`skywars 1.txt`, `sg.txt`, `block party.txt`), a new game is started, and the log is processed automatically.
Dropping a `.json` file loads tournament data instead.

Saving is explicit (Save/Load JSON) — there is no crash/emergency backup. Starting a new game rolls the
previous one into history and shows a brief, dismissible reminder to save tournament progress.

### Project structure
```
index.html            Single page; tabs switch client-side (no reload)
css/                  global.css (tokens/base) + app.css (components)
js/
  core/               ChatUtils, Toast, PosterExport, PointSystem, GameState, ScoringEngine
  parsers/            GamemodeParser (base) + one subclass per gamemode + registry
  renderers/          Scoreboard / Teams / Stats / Settings views
  app.js              Controller: wires the DOM to the engine and renderers
tests/                Node harnesses (no dependencies)
```