# Changelog

All notable changes to HQ Office are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-10-23

### Added

- **HQ learns to talk to you through the HUD.** An HQ agent that answered your notes in its own terminal was never
  heard. Now, when herdr detects your HQ agent starting, the plugin types a short guide into it once per session
  (reply with `hud tell` or `hud comment ID`, ask with `hud ask` and edit in place, track work on the board, read
  `hud board` every sweep), and every note, answer and reply typed into HQ ends with a one-line reminder to reply
  through the HUD. `hud guide` prints the guide; the status pane says whether HQ's current session has it.
  `HUD_HQ_HINT=0` and `HUD_HQ_GREET=0` turn the two off.

## [0.3.2] - 2026-10-23

### Fixed

- **A lane in a phase HQ named itself (such as "paused") never got its background work checked**, so a lane running
  a subagent or shells still read as HQ's turn. Every lane that would otherwise read as HQ's turn or stale is checked now.

## [0.3.1] - 2026-10-23

### Fixed

- **Lanes running a subagent read as waiting on HQ.** An agent that is idle while a subagent works (its status bar
  shows "← 1 agent", or its pane lists a running subagent such as "◯ general-purpose ... 34m 0s"), or while
  shells and monitors run ("1 shell, 1 monitor"), now counts as moving.
- **Re-tracking finished work.** `hud track ISSUE` on an item whose pull requests have all ended reopens it as
  moving: PRs that ended before you tracked it again no longer count towards done, so a new PR decides.

## [0.3.0] - 2026-10-23

### Added

- **Service mode.** The new **install service** action runs HQ Office as a per-user service that starts when you
  log in and restarts if it stops: a LaunchAgent on macOS, a systemd user unit on Linux. Run it again after a
  `config.env` change or a plugin update to rewrite the service and restart it; **remove service** takes it away
  and leaves your data where it is. With the service installed, start, stop and restart use it instead of a
  background process, and the status pane says whether the service is installed and running.
- **The `hud` command, installed for you.** The **install hud command** action puts `hud` in `~/.local/bin`,
  pointing at the plugin's `hud.ts` and your server's port, and tells you if that folder is not on your PATH. Run
  it again to update it. It never replaces a `hud` that is not its own; it tells you what that one points at and
  how to replace it.

### Changed

- **Settings are kept on the server.** Your hero, season, hero hat and SOUND are saved in the data directory, so
  they survive a restart, a plugin update and clearing your browser's data, and every browser you open HQ Office
  in shows the same ones. The first time you open the page after updating, the settings your browser remembered
  are moved to the server.

### Fixed

- **Lanes that were working read as waiting on HQ.** An agent that is idle but still has shells or a monitor running
  in the background (its pane ends with "2 shells still running" or "monitor still running") now counts as moving,
  in the room, the top bar and the work board, instead of HQ's turn or stale.

## [0.2.0] - 2026-10-23

### Added

- **FROM HQ.** HQ can now tell you things without asking: `hud tell --title "PR is up" [--body ...] [--lane ...]`
  (`hud say` works too). Updates land in the FROM HQ feed under the room, the top bar counts the unread ones, and
  you can mark one or all of them read.
- **The MESSAGES tab.** One thread, oldest at the top, of HQ's updates and your notes. Reply to any message: the
  reply reaches HQ as a note that says what it answers. Your notes show whether HQ has picked them up yet.
- **The work board.** A WORK tab lists every piece of work in flight: its issue, its pull requests and the lane that
  owns it. Each item's state (done, waiting on you, waiting on CI, paused, moving, stalled) is worked out from
  GitHub, the lane and your open questions. Stalled work shows as a red strip at the top of the question column.
  HQ uses `hud track`, `hud done`, `hud pause`, `hud resume` and `hud board`. Needs the `gh` CLI.
- **Questions that change in place.** HQ can edit an open question (`hud update`) instead of withdrawing and
  reposting it; the card shows EDITED and the time, and your typed answer stays. HQ can comment under a question
  (`hud comment`) and give it a checklist (`hud ask --item ...`, `hud item`). A checklist item that names a pull
  request ticks itself when that PR merges, and a question whose items are all done closes itself.
- **The secret drop.** Paste an API key or token into the SECRETS tab, or into the fields of a question HQ asked
  with `hud ask --secret NAME`, with a lifetime in minutes. HQ reads it with `hud secret get NAME | <command>`
  until it expires. Values stay in the server's memory only: never in the database, a log, the page or a listing.
- **Settings.** A SETTINGS panel to pick your hero (the default one carries your `HUD_OWNER` name), the season and
  the hero's hat, each remembered in your browser, with a reset to defaults.
- **Seasons and holidays.** The room follows the calendar: spring, summer, fall and winter views out of the
  windows, snow and falling leaves, and its own decorations for Christmas, New Year, Valentine's Day,
  St. Patrick's Day, Easter, Halloween and Thanksgiving. Workers and the hero wear seasonal hats and carry seasonal
  items. Preview any season with `?season=halloween` (or any other) or from SETTINGS.
- **The break room.** Idle workers wander to the break room for coffee and snacks, chat in pairs, and check their
  watch now and then while they wait.
- **The hero's dance and sleep.** With nothing waiting on you, the hero behind the counter dances a routine that
  ends in a moonwalk. From midnight to seven the hero sleeps in a bed behind the desk instead.
- **New character sprites.** Handheld-RPG style workers with 12 kinds of head and hair.
- **Machine health.** A chip per machine in the top bar shows its CPU and memory, sampled every minute. Remote
  machines in `HUD_MACHINES` are sampled over SSH.
- **A chime for new questions.** Turn SOUND on and a short chime plays when a new question arrives. Generated in
  the browser, no audio files.
- Long messages fold to a few lines with MORE and LESS.

### Changed

- **A new layout.** Questions on the left, the room and the feed on the right.
- **Your name, not a fixed one.** The notes and answers HQ is sent, and the event log, name you from `HUD_OWNER`,
  or "the owner" when it is unset. Events logged by 0.1.0 read as yours.
- **Lighter on your machine.** The server sends each open page only the parts of the state that changed, and the
  page redraws only the panels whose data changed. The room copies pre-painted sprites instead of drawing every
  pixel, stops drawing while the tab is hidden, and keeps animating (at a lower frame rate) when the window is
  visible but not focused. Fewer disk writes per herdr sync and per machine sample, and one SSH connection kept
  for remote machine stats.
- **For contributors.** The page and the server are split into one file per concern (`public/`, `src/client/`,
  `src/server/`), so a new feature arrives as new files. `AGENTS.md` and `docs/structure.md` explain the layout,
  and `scripts/release.ts` is the release routine.

### Fixed

- **FROM HQ was always empty.** The released page had the tab but the server had no routes for it. Thanks to
  Aleksander (PR #1).
- **The plugin's actions and status pane failed with "No such file or directory"** when herdr's PATH did not
  include `~/.bun/bin`, Bun's default install folder. Every action and the pane now add it. Thanks to Aleksander
  (PR #1).
- **Every note to HQ said the same fixed name.** It now uses `HUD_OWNER`. Thanks to Aleksander (PR #1).
- Standing workers no longer stack on one tile.
- The log of what you sent and answered shows notes and answers in one time order.
- An answer is saved and shown as sent even when herdr cannot be started to deliver it.
- A page closes its stream when it goes away and reopens it when shown again from the browser's back-forward cache.

## [0.1.0] - 2026-10-22

The first public release.

### Added

- **The office.** A pixel-art room in the style of a handheld RPG where every herdr lane (one agent working one
  task) is a worker at a desk, coloured by status: working, waiting on you, waiting on HQ, done. Click a worker for
  its card. HQ sits at its terminal, and the hero dances behind the counter when nothing is waiting on you.
- **The question panel.** HQ's questions, most urgent first, with options to pick or a box to type in. Your answer
  is typed straight into the HQ agent's session the moment you send it, and stored, so nothing is lost if HQ is
  busy. Code in a question shows in a box with a copy button.
- **Tell HQ.** A free-text box for anything HQ did not ask about.
- **Images.** Drop or paste an image into any text box; it is saved and its path put into the text for HQ to open.
- **The herdr plugin.** Install with `herdr plugin install`, then the start, stop, reload and open actions and a
  status pane. Configured in `config.env`; the database and images live in the plugin's state directory and
  survive reinstalls.
- **The `hud` CLI** for HQ: add lanes, ask questions, wait for answers, read the inbox.
- The page reloads itself when the server changes.
