# Changelog

All notable changes to HQ Office are listed here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Requests: a lane's ask of HQ is a record that closes when the answer arrives.** A lane files `hud request --kind READY|BLOCK|QUESTION|DONE --lane NAME "text"`; HQ runs `hud req next`, `hud req list` and `hud req answer ID "text"`, which types the answer into the lane's pane and closes the request in one step (if the pane is not reached the request stays open). A BLOCK or QUESTION can carry `--default` and `--by`: at that time it is marked defaulted and the lane goes ahead.
- **`GET /api/agents`** lists every named herdr agent with when its status last changed, from the 20 second sync, so a sweep can tell how long a pane has really been quiet.

## [0.8.1] - 2026-10-24

### Changed

- **Every send box is one composer, like a chat app.** Tell HQ, each question's answer box and a reply in MESSAGES
  are now a single rounded box: your images on top, the text field at full width (no more short lines wrapping
  beside the buttons), and a slim row under it with the photo button on the left and SEND, DONE or OK on the right.
  The field grows with what you type, up to five lines, then scrolls. On a computer the box stays compact: about
  22 px taller than before for a question's answer, 16 px for Tell HQ, and about the same for a reply.
- **Images are thumbnails in the box.** Each attached image is a rounded thumbnail with a small round × on its corner
  (an easy target on a phone). While it uploads it is dimmed under a spinner; a failed upload gets a red ring and a
  retry icon (tap it to try again); an image that is too big or that the browser cannot read stays in the box with
  one line saying why. Tap a thumbnail to see it full screen; tap outside it or the close button to go back.

## [0.8.0] - 2026-10-24

### Added

- **Attach images from a phone.** Every send box (Tell HQ, each question's answer, a reply in MESSAGES) has an
  ATTACH button beside SEND. On a phone it opens the phone's own menu (photo library, camera, files); on a computer,
  a file picker. Pick several at once. Each image is shrunk in the browser to at most 2048 px on its longest side,
  as JPEG (or WebP where that is smaller), so uploads are quick on a phone connection and iPhone HEIC photos, which
  the server does not take, arrive as JPEG. GIFs and images already small are sent as they are.

### Changed

- **Images show as chips under the box, not as paths in your text.** Picked, dropped or pasted images appear as
  thumbnails with a × to remove them, and the text box stays clean. On send the `[image: /path]` tokens are added at
  the end of the message, so HQ receives the same as before. A failed upload shows on its chip with RETRY; an image
  that is too big or that the browser cannot read says why. Images are part of the draft: they stay through live
  updates and a reload, and clear once sent.
- **Drafts survive any reload.** Unsent text, an open reply and attached images used to be kept only when the page
  reloaded itself after an update; now they are kept on every reload, and when a phone drops the page while its
  camera is open.

### Fixed

- On a phone, any tap inside MESSAGES or FROM HQ rebuilt the question list, the thread and the log. Only MORE does now.

## [0.7.2] - 2026-10-24

### Fixed

- **ARENA now visibly dresses the whole room.** With ARENA picked and no lane tree, every worker was already given
  the player look, but that look was a teal shirt and a tiny number on the worker's everyday sprite, with the
  season's hat still on top, so at real size nobody looked in costume. The hero and HQ were never dressed at all.

### Changed

- **A theme dresses every figure in the room, whatever the levels.** In ARENA:
  - **Players** (the deepest level, and everyone when lanes have no tree) wear one matching numbered tracksuit:
    top and trousers alike, white piping, a white zip, white trainers and a white number on the chest and back.
    Each player keeps its own hair and face. Seasonal hats and coats are left off; seasonal things in the hand stay.
  - **Guards** (levels 1 and 2 in a tree) are as before (a square or a triangle on the mask), now with nothing
    seasonal over the mask.
  - **Your hero** behind the counter is the game master: a long black coat with gold buttons, black gloves and a
    black mask with gold eyes. The mask covers only the face, so the HERO you picked keeps its hair (and glasses).
    It stays in costume while it stands, dances and moonwalks, and asleep in bed at night. No hat is drawn on the
    mask, so HERO HAT has no effect in ARENA.
  - **HQ** at its terminal is the senior guard: the hooded suit with a gold crown on the back of the hood.

  OFFICE looks exactly as before: its everyday clothes are its costume, and a tree adds the suit and the cardigan.

## [0.7.1] - 2026-10-24

### Changed

- **MESSAGES and FROM HQ take a bounded height on a phone, each with its own scroll.** With a busy day they used to
  stretch the page to about 13,000 pixels, so Tell HQ, the room and the worker card were thousands of pixels away.
  Now the page is about 1,800 pixels tall on an iPhone: MESSAGES fits on one screen with its tabs and Tell HQ, and
  FROM HQ (with SENT & ANSWERED and SECRETS) fits on one screen with the room. Swiping inside a list scrolls that
  list, with momentum, and reaching its end does not drag the page; a fade at an edge shows there is more that way.
  MESSAGES still opens at the newest message and stays there while you are at the bottom; reading older messages or
  older updates, a live update or a reply no longer moves what you read (FROM HQ used to jump by one update). At the
  top of FROM HQ a new update shows first. The desktop is unchanged.

## [0.7.0] - 2026-10-24

### Added

- **Lanes in levels.** Lanes can now form a tree under HQ: a lane reports to HQ (level 1), or to another lane, which
  puts it one level deeper. HQ or a lane sets it with `hud lane NAME --parent OTHER`; `--parent hq` puts a lane
  straight back under HQ. A lane that starts lanes of its own registers them with itself as their parent. A parent
  that would make a loop is refused with an error that shows the chain, and when you remove a lane, the lanes that
  reported to it move up one level instead of being lost. Nothing changes until a lane gets a parent.
- **Name your levels.** SETTINGS has LEVEL NAMES: one name per level from the top, comma-separated. The default is
  `Manager, Lead, Engineer`; `PM, Senior, Junior` or `L1, L2, L3` work just as well. Lanes deeper than your list take
  the last name.
- **See the levels in the room.** Once there is a tree, each level dresses differently, and every worker keeps its own
  hair, skin and colours. Pick the look in SETTINGS under LEVEL THEME:
  - **Office** (the default): level 1 wears a dark suit and a tie in its own colour (all suit from behind), level 2 a light cardigan over
    its own shirt, level 3 and deeper the everyday look. A room without a tree looks exactly as before.
  - **Arena**: levels 1 and 2 are masked guards in a magenta hooded suit, with a white square (level 1, who also
    wears a black belt) or a triangle (level 2) on the black mask and on the back of the hood; level 3 and deeper are
    players in a teal tracksuit with a white number. In a room without a tree, everyone is a player. Our own art, not
    any show's.
- **A level mark on every name label**, so the level reads from any side, even from behind at a desk: three pips
  for level 1, two for level 2, one for level 3 and deeper, in a colour that matches the theme's look (Office: gold,
  cream, blue; Arena: pink for guards, teal for players). Only in a room with a tree.
- **The worker card** shows the lane's level and its chain up to HQ, for example `HQ > web-pm > api-lead > api-auth`;
  click a step to open that lane.
- **`hud tree`** prints the tree with each lane's level name and status (`--json` for JSON). On the WORK tab and in
  `hud board`, the work in each state is grouped under the lane its lane reports to; stalled work still comes first.

## [0.6.4] - 2026-10-23

### Fixed

- **Messages scroll like a chat on a phone.** MESSAGES opens at the newest message instead of eight screens above
  it; at the newest message, a new one stays in view; reading older ones, a live update or a reply landing above no
  longer moves what you are reading (the same holds for the questions). The QUESTIONS / MESSAGES / WORK tabs stay at
  the top of the screen while their list scrolls, and switching tabs starts the list at its top. The sent log under
  the room no longer scrolls inside the page. The desktop layout is unchanged.
- **No zoom on a phone.** The page no longer zooms on a pinch, a double tap or a tap into a text field (every text
  field is 16px on a phone).

## [0.6.3] - 2026-10-23

### Fixed

- **Running the plugin's script by hand could point the service at an empty board.** Outside herdr, the script fell
  back to folders inside the plugin, so a restart rewrote the service to a new, empty database and dropped your
  config.env settings (nothing was lost; the real data stayed put). The installed plugin now finds herdr's own
  config and data folders when run by hand, and restart refuses to point an installed service at a different data
  folder than the one it uses (`--force` moves it on purpose).
- The plugin's messages give the exact restart command, `herdr plugin action invoke hq-office.reload`.

## [0.6.2] - 2026-10-23

### Fixed

- **A phone can use HQ Office again.** Since 0.2.0 every page that is not this machine's own was refused, which also
  stopped a phone opening the page through `tailscale serve`: it loaded empty and every answer was "forbidden". List
  your phone's page address in `HUD_TRUSTED_ORIGINS` (exact, comma-separated) and it can read and answer like the
  machine's own page. Every other site is still refused, and secrets stay this machine's own page only. Thanks to
  Aleksander (PR #2).

## [0.6.1] - 2026-10-23

### Fixed

- **SETTINGS no longer hides your hero.** The panel opens from the bottom right, so the hero behind the counter
  stays in view and a click on a hero or a hat shows its result at once.

## [0.6.0] - 2026-10-23

### Added

- **A PERFORMANCE setting in SETTINGS: SMOOTH, BALANCED or POWER SAVER**, saved on the server with the other
  settings and applied at once. SMOOTH (the default) draws walking, the hero's dance, snow, leaves, event effects
  and steam at 30 frames a second, focused or not. BALANCED is the 0.5.0 room: walking at 10 frames a second, small
  motions on a slow beat. POWER SAVER freezes everything but walking workers (8 frames a second); a room where
  nobody walks shows no new frames at all. What it costs, measured in Safari with the page in front: SMOOTH about
  3 to 4% on an ordinary day, but about 15% all day in snowy and event weeks, when the weather never stops; BALANCED
  about 2%; POWER SAVER about 1%.

### Changed

- **A quiet room costs less.** The room's small motions (desk screens, HQ's terminal, coffee lights, bobs, nods,
  bubbles) now share one beat, so they share frames: in BALANCED a room where nobody walks shows 1 frame a second
  (was 2) in a plain season and 2 (was 4) in snowy and event weeks. The coffee machines' lights blink once a
  second, and the kitchen machine steams only while someone takes a coffee.

## [0.5.1] - 2026-10-23

### Changed

- **Chimes you recognise across the room.** A new question now plays a marimba call ("dum, da-DUM", rising), and a
  new message from HQ plays a soft bubble pop and a bell. Different instruments, so you tell them apart at once.

## [0.5.0] - 2026-10-23

### Changed

- **The room costs about an eighth of what it did.** A browser pays for every frame it shows, whatever is drawn, and
  the room used to show 12 to 30 frames a second all day even when nothing in it moved. Now it shows a frame only
  when something visible changes: 10 a second while someone walks, otherwise one per quarter-second beat for the
  room's small motions (screens, steam, the hero's dance), and none when nothing changes. Measured in Safari with the
  page in front: from about 26% extra CPU to about 3%. On a second screen, about 2 to 4 frames a second instead of 12.
  It still animates whenever the window is visible, focused or not.
- **Idle workers are calmer.** They rest 8 to 20 seconds between errands instead of 1 to 3, so someone is walking
  about 15% of the time instead of 36%.
- The hero's dance steps on the beat: each move is a short ground-and-air bounce.

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
