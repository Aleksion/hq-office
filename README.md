# HQ Office

HQ Office is a small local web app for people who run AI coding agents in [herdr](https://herdr.dev). It draws a pixel-art office in the style of a handheld RPG: every lane (one agent working one task) is a worker at a desk, and you can see at a glance who is busy, who is blocked and who is done. Next to the room is the question panel, where your HQ agent (the agent that coordinates the others) asks you things and you answer them. Your answers are typed straight into the HQ agent's session.

## Requirements

- [herdr](https://herdr.dev) 0.8.0 or newer
- [Bun](https://bun.sh) 1.1 or newer
- macOS or Linux

## Install

```sh
herdr plugin install NicolaiHerforth/hq-office
```

## First run

1. Run the start action:
   ```sh
   herdr plugin action invoke hq-office.start
   ```
   It creates `config.env` in the plugin's config directory (the path is printed; `herdr plugin config-dir hq-office` shows it too), starts the server and opens the page.
2. Edit `config.env` and set `HUD_HQ_AGENT` to the herdr agent name of your HQ lane. `herdr agent list` shows the names; the start action prints them too when `HUD_HQ_AGENT` is empty.
3. Restart to pick up the change:
   ```sh
   herdr plugin action invoke hq-office.reload
   ```

The database and uploaded images live in the plugin's state directory, so they survive reinstalls.

## Actions and pane

| Name | What it does |
| --- | --- |
| `hq-office.start` | Starts the server if it is not running, then opens the page in your browser. |
| `hq-office.stop` | Stops the server the plugin started. |
| `hq-office.reload` | Stop, then start. Use it after editing `config.env`. |
| `hq-office.open` | Opens the page without touching the server. |
| `status` pane | A popup with the server state, open questions, lanes by status, the HQ agent, the data directory and the URL. |

## The question panel and Tell HQ

Questions from HQ appear at the top of the panel, most urgent first. Pick an option or type an answer; it goes to HQ the moment you send it. Tell HQ is a free-text box for anything HQ did not ask about, such as a new priority or a correction. Both are stored, so nothing is lost if HQ is busy.

HQ uses the CLI in `hud.ts` (`bun hud.ts help` from the plugin directory; set `HUD_URL` if you changed the port) to add lanes, ask questions and wait for your answers. HQ posts progress to the **FROM HQ** tab with `hud tell --title "PR is up" [--body "details"] [--lane NAME]` (`hud say` is the same command); the tab counts unread updates until you open them or mark them all read.

## Secrets

Paste a key into the SECRETS tab (under the room) with a name and a lifetime in minutes, or into the fields of a question HQ asked with `hud ask --secret NAME`. HQ reads it until it expires:

```sh
hud secret get NAME | <command>          # the raw value, to a pipe only; refuses a terminal
hud secret get NAME --once | <command>   # and delete it on read
<command> | hud secret set NAME --minutes 30   # the value comes from stdin, never an argument
hud secret rm NAME
hud secret list                          # names, who set them, when they expire
```

Values live in the server's memory only: never in the database, the log, `/api/state` or any listing, and a restart clears them all. The deadline is checked on every read. Secret routes answer only to this machine, the read route only to a client that is not a browser, and any request from another web origin is refused.

## The work board

The WORK tab lists every piece of work in flight: an issue key, its pull requests and the lane that owns it. HQ adds one with `hud track ISSUE --lane L --pr N`, and `hud lane NAME --issue X --pr N` links a lane's work too. Each item's state is worked out from facts, in this order: done (all PRs merged or closed, or `hud done ISSUE`), waiting on you (an open question names its lane, issue or PR), waiting on CI (a check is running), paused (`hud pause ISSUE REASON`, undone with `hud resume ISSUE`), moving (the lane is working, or something changed in the last 45 minutes), and otherwise stalled. Stalled work shows red at the top of the question column and at the top of `hud board` (`--json` for JSON).

PR facts come from the `gh` CLI. The server caches them and refreshes them every 10 minutes while anything is open, and when HQ runs `hud board` if the cache is over a minute old. Page loads never call GitHub.

## Changing a question in place

HQ keeps one question per thing by changing it instead of withdrawing and reposting it:

```sh
hud update ID [--title T] [--body B] [--opt A --opt B] [--rec A] [--link URL]   # only the fields given; the card shows EDITED hh:mm
hud comment ID TEXT                          # a timestamped line under the question (latest 5 shown, MORE for older)
hud ask --title T --item "Land #1234" --item "Write the notes"                  # a question with a checklist
hud item ID N done|undo                      # tick item N (from 1) by hand
hud item ID add TEXT                         # add an item to an open question
```

Your typed answer stays on the card through an edit; a picked option the edit removed is unpicked. Comments are information: they never reach HQ's inbox, cost no points and leave the question's timer alone. An item that names a PR (`#1234`, `owner/repo#1234` or a PR link) ticks itself when that PR merges. Its facts come from the work board's GitHub cache, on the board's own refresh, and only while the question is open. When every item is done the question closes itself with the answer "all done". If HQ ticked the last item, it is already acked. If a merge did, it waits in `hud inbox` and is not typed into HQ's session.

## Images

Drop or paste an image into any text box on the page. It is saved in the data directory and its path is put into the text, so HQ can open it.

## Configuration

Set these in `config.env`. An empty value means the default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HUD_HQ_AGENT` | `hq` | herdr agent name of your HQ lane. Answers and notes are typed into it. |
| `HUD_OWNER` | empty | Your name: on the desk sign, on the default hero, and in the notes and answers HQ is sent. Empty means "the owner" (and "YOU" on the hero). |
| `HUD_PORT` | `4747` | Port the server listens on. |
| `HUD_HOST` | `127.0.0.1` | Address the server binds to. |
| `HUD_GITHUB_REPO` | empty | `owner/repo`, used to link lanes to pull requests. |
| `HUD_LINEAR_WORKSPACE` | empty | Linear workspace slug, used to link lanes to issues. |
| `HUD_LOCAL_MACHINE` | `local` | Name of this machine in the room. |
| `HUD_MACHINES` | this machine | Comma-separated herdr machine labels to poll for agents and sample for CPU and memory. Remote machines need SSH access. |
| `HERDR_BIN` | `herdr` on PATH | Path to the herdr binary. |
| `HUD_GH_BIN` | `gh` on PATH | Path to the GitHub CLI, used by the work board. |
| `HUD_DATA_DIR` | plugin state dir | Where the database and uploads live. The plugin sets it; leave it empty. |

## Running without the herdr plugin

```sh
bun server.ts
```

Then open http://127.0.0.1:4747. Without the plugin the database and uploads live next to `server.ts` unless you set `HUD_DATA_DIR`. All the variables above work as plain environment variables, for example `HUD_HQ_AGENT=lead bun server.ts`.

Run the tests with `bun test`.

## Working on it

No build step: `public/index.html` is the page shell, `src/client/` the page as plain ES modules (one folder per area), `src/server/` the server (one file per concern, routes in `src/server/routes/`, one schema file per table in `src/server/schema/`). `AGENTS.md` has the map and the rules for working on it in parallel; `docs/structure.md` explains the layout and its trade-offs.
