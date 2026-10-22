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

HQ uses the CLI in `hud.ts` (`bun hud.ts help` from the plugin directory; set `HUD_URL` if you changed the port) to add lanes, ask questions and wait for your answers.

## Images

Drop or paste an image into any text box on the page. It is saved in the data directory and its path is put into the text, so HQ can open it.

## Configuration

Set these in `config.env`. An empty value means the default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HUD_HQ_AGENT` | `hq` | herdr agent name of your HQ lane. Answers and notes are typed into it. |
| `HUD_OWNER` | empty | Your name, shown on the desk sign in the room. |
| `HUD_PORT` | `4747` | Port the server listens on. |
| `HUD_HOST` | `127.0.0.1` | Address the server binds to. |
| `HUD_GITHUB_REPO` | empty | `owner/repo`, used to link lanes to pull requests. |
| `HUD_LINEAR_WORKSPACE` | empty | Linear workspace slug, used to link lanes to issues. |
| `HUD_LOCAL_MACHINE` | `local` | Name of this machine in the room. |
| `HUD_MACHINES` | this machine | Comma-separated herdr machine labels to poll for agents and sample for CPU and memory. Remote machines need SSH access. |
| `HERDR_BIN` | `herdr` on PATH | Path to the herdr binary. |
| `HUD_DATA_DIR` | plugin state dir | Where the database and uploads live. The plugin sets it; leave it empty. |

## Running without the herdr plugin

```sh
bun server.ts
```

Then open http://127.0.0.1:4747. Without the plugin the database and uploads live next to `server.ts` unless you set `HUD_DATA_DIR`. All the variables above work as plain environment variables, for example `HUD_HQ_AGENT=lead bun server.ts`.

Run the tests with `bun test`.
