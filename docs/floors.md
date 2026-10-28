# Floors

A floor is one HQ agent and everything it runs. One HQ can direct only so many lanes; floors let the owner run
several HQs side by side, each owning a domain (frontend, backend, legal...). One floor behaves exactly as HQ Office
did before floors, and nothing about floors shows until there is a second one.

Phase 1 is the server and `hud`. Phase 2 is the page, built on the state contract below (see "The page").

## The model

- Table `floors`: `id` (a slug), `name`, `color` (`#rrggbb`), `hq` (the herdr agent that is its HQ), `position`,
  `created_at`, and `hq_pane` / `hq_seen_at` (the pane its HQ was last seen in, for the NAME button and the heal).
- **The upgrade.** At start, with no floors, the server makes the first floor: id and name `hq` / `HQ`, or from
  `HUD_FLOOR_NAME` (its id is the name as a slug), with `HUD_HQ_AGENT` as its HQ and the pane `hq_link` held. Every
  existing row is put on it. Its `hq` is stored empty and read from `HUD_HQ_AGENT`, so that setting keeps working;
  `hud floor set ID --hq AGENT` stores one.
- A `floor` column on `lanes`, `asks`, `updates`, `notes`, `rooms`, `work_items`, `hq_outbox` and `events`.

Shared by every floor: secrets, settings (the sweep settings too), machines and sound.

## Who is calling

`hud` sends `x-hud-pane: $HERDR_PANE_ID`, and `x-hud-machine: $HUD_LOCAL_MACHINE` when it is set. Every sync
records each named agent's pane (by machine). The caller's floor is:

1. an explicit floor: `x-hud-floor` (`hud ... --floor ID`), or `floor` in the body or the query; then
2. the floor whose HQ is the agent in that pane; then
3. the floor of the lane the agent is; then
4. the first floor.

`x-hud-floor: all` (`hud ... --all`) asks for every floor where a read is scoped.

## Which floor a thing belongs to

| Thing | Floor |
| --- | --- |
| Lane | `--floor`, else its parent's floor, else the caller's. Re-registering an existing lane never moves it, except with `--floor` or a `--parent` on another floor. |
| Moving a lane (`hud lane NAME --floor ID`) | Its whole subtree moves, with their open questions, the rooms they own and their board items. A lane whose parent stays behind reports to its new floor's HQ. `--floor` with a `--parent` on another floor is refused. |
| Ask, update | Its lane's floor, else the caller's. `hud update ID --lane L` moves the ask to L's floor. |
| Room | Its owning lane's floor, else the caller's (a room HQ owns keeps its floor when changed). |
| Board item | Its lane's floor; an item with no lane, the floor it was tracked from. |
| Note from the page | `floor` in the body of `POST /api/notes`, else the first floor. |
| Event | The floor given, else its lane's floor; else none. |

## Routing to an HQ

`notifyHq(text, ref, floor)` types into that floor's HQ (the first floor's when none is given):

- an answer, and a NOT YET: the ask's floor;
- a note: the note's floor;
- a lane blocked on a prompt: the lane's floor;
- a room the owner closed: the room's floor; a room message to `hq` goes to the room's floor's HQ;
- a secret the owner sets, and secrets lost in a restart: every floor's HQ;
- `hud floor tell FLOOR TEXT`: that floor's HQ, as `HUD from floor <caller's floor>: TEXT`, with an event line.

## Per floor, inside the 20 s sync

No new timers. Each sync, for each floor in order: the HQ link (receiving or not, the reason, since when, the
candidate pane for NAME), the quiet rename heal (the pane HQ was tracked in), HQ's herdr status, the outbox flush
with confirmed delivery and resend, and then the sweep nudge. The sweep settings are shared; each floor's HQ is nudged
about its own floor only (its idle and gone lanes, stalled items, open questions, rooms), with its own last nudge,
next nudge and backoff. One floor's HQ not receiving never holds up another's outbox.

## Reading is scoped

By default to the caller's floor, with `--all` for every floor: `hud inbox`, `hud wait`, `hud ack` (another
floor's answer or note is refused without `--all`), `hud board`, `hud tree`, `hud room list` (there `--all` also
lists archived rooms, as before). An HQ never sees another floor's answers or notes in its inbox. `/api/state` is
not scoped: the page gets every floor, each row tagged.

## CLI

```
hud floor add ID --hq AGENT [--name N] [--color #hex]
hud floor list [--json]          id, name, HQ, receiving, lanes, waiting on the owner (* marks your floor)
hud floor set ID [--name N] [--hq AGENT] [--color #hex]
hud floor rm ID                  refused unless the floor is empty (no lanes, open questions, open rooms,
                                 open board items, or messages held for its HQ); the last floor never goes
hud floor tell FLOOR TEXT
hud lane NAME --floor ID
```

A floor's id is 1 to 32 lowercase letters, digits and dashes (not `all`). One agent is the HQ of one floor only.
What a removed floor leaves behind (answered questions, updates, notes, the log) moves to the first floor.

## API

| Route | Body | Reply |
| --- | --- | --- |
| `GET /api/floors` | | `{ floors: S.floors, caller: "<floor id>" }` |
| `POST /api/floors` | `{ id, hq, name?, color? }` | `{ id }` |
| `POST /api/floors/ID` | `{ name?, hq?, color? }`, or `{ rm: true }` | `{ ok: true }`, or `{ floors: [ids] }` after a remove |
| `POST /api/floors/ID/tell` | `{ text }` | `{ ok: true }` |
| `POST /api/notes` | `{ text, floor? }` | `{ ok: true }` |
| `POST /api/hq/check`, `POST /api/hq/name` | `{ floor? }` | that floor's link (the first floor's without one) |
| `POST /api/updates/read-all` | `{ floor? }` | marks that floor's updates read (every floor's without one) |

## State contract for the page

- `S.floors`: an array, by position, of
  `{ id, name, color, hq, receiving: true | false | null, reason, counts: { needsYou, blocked, working, lanes, unreadMessages } }`.
  `receiving` is null until the first sync has checked that floor's HQ. `needsYou` counts the floor's open
  questions, `blocked` its lanes blocked on a prompt, `working` its lanes at work (herdr working, or something still
  running in the background), `lanes` all its lanes, `unreadMessages` its unread updates from HQ.
- Every lane, open ask, answered ask, update, note, room (`S.rooms[i].floor`) and board item
  (`S.board.items[i].floor`) carries `floor`. Events carry `floor` too (null for one about no floor).
- `S.hq` stays the first floor's link, unchanged in shape: `{ agent, ok, reason, since, candidate, deliveries, held }`.
  `S.hqLinks` maps floor id to the same shape for every floor (the first floor's included); `deliveries` and `held`
  hold that floor's messages only.
- `S.sweep` keeps its shape (`{ on, minutes, hours, lastAt, nextAt, backoff }`) for the first floor.
  `S.sweepByFloor` maps floor id to `{ lastAt, nextAt, backoff }`.
- `S.board.counts` and `S.board.blockedLanes` count every floor; a page scoped to a floor filters `items` by `floor`.

## The page

One floor (`S.floors` has one entry) is the page as it was before floors: no element, tag or border more. The room's
pixel and layout test proves it (`PIXEL_BASE=<ref> bun test test/client/room-pixels.test.ts`); the only addition is the
FLOORS section in SETTINGS, which the hash leaves out as it does other new settings rows. With two or more floors:

- **The scope** (`src/client/core/scope.js`): the floor you are in, or none (the building), and SHOW ALL. It is kept in
  sessionStorage, dropped when its floor is gone, and every change emits `scope` on the bus. `listFloor()` is the
  floor the lists show (none in the building or under SHOW ALL), `pick(list)` a list's rows on it by their `floor`,
  `others(list)` how many are left out, `tagged()` whether cards carry their floor's tag. Pure helpers of `S` (the
  floor list, a floor's HQ link, the tag and the "+N on other floors · show all" line) are in `core/floors.js`.
- **The stage** (`src/client/floors/`): a bar over it, and THE BUILDING or the floor's office. The building is one
  tile per floor, the first at the bottom, each a button with a small plan of its office drawn on a 64x30 canvas once
  and again only when its lanes or colour change (no live canvas per tile), its name, its HQ, `S.floors[i].counts`
  and a red mark when `receiving` is false. Inside a floor the office's workers are that floor's lanes
  (`officeLanes()` in `room/workers.js`), HQ at the terminal is labelled with that floor's HQ agent, and the room's
  frame takes the floor's colour. The office's frame loop rests while the building shows, as it does under a
  conference room. Esc steps out of a floor (not while typing, in SETTINGS, a conference room or a preview). A lane's
  tag on another floor's card takes you to that floor before it selects the worker.
- **Lists and counts**: NEEDS YOU, MESSAGES, WORK (and its STALLED strip), ROOMS, FROM HQ and SENT & ANSWERED, and
  the tab counts, follow `listFloor()`. A floor's unread messages count is `S.floors[i].counts.unreadMessages`; WORK
  counts its own items. The top bar counts every floor. Opening MESSAGES marks only the shown updates read; MARK ALL
  READ sends `{ floor }`. A note's and an answer's delivery mark reads its own floor's link in `S.hqLinks`.
- **TELL HQ** sends `floor` with the note: the floor you are in, else the one in the FLOOR select beside SEND (made
  the first time the building or SHOW ALL shows; it defaults to the last floor used, kept in localStorage). The
  placeholder names the floor (`Tell HQ (Backend)…`), or says its HQ isn't receiving. A reply in MESSAGES goes to
  the floor of what it answers.
- **HQ isn't receiving**: the strip shows the link of the floor you are in; in the building, one line per floor whose
  HQ isn't receiving, each with its own NAME and CHECK NOW (they send `{ floor }`). A toast says when any floor's HQ
  stops receiving; the window title says it while any is down.
- **SETTINGS · FLOORS** (`settings/floors.js`) lists the floors and adds one (`POST /api/floors` with an id made from
  its name), changes one (`POST /api/floors/ID`), or removes an empty one (`{ rm: true }`) after a confirm in the
  page. The HQ is picked from herdr's agents that are not lanes and run no floor (`untracked` in `/api/state`, read
  once when the form opens: the page's stream leaves it out), or typed. Colours come from a fixed palette.
- SECRETS stay global. Phase 3 polishes the phone; at 390 px the building is one column of tiles and the bar wraps.

The building, the scope (SHOW ALL, marking read within it, the scope kept in sessionStorage) and floor tags are
adapted from PR #8 by Aleksander. Floors themselves come from `S.floors`, not the depth of the lane tree, and only the
floor you are in has a live office.
