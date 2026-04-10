# Blood on the Clocktower Discord Bot

A Discord bot for running **Blood on the Clocktower: Trouble Brewing** games, semi- to fully automatically. Includes a web-based Admin UI for Storytellers in Manual Mode.

> This bot currently only supports the **Trouble Brewing** script.

> This is a fan-made project. I'm not affiliated with or endorsed by The Pandemonium Institute.

## Modes

The bot supports two modes:

- **Manual Mode** (`/iam`): A human Storyteller runs the game. The bot handles deterministic mechanics and **suggests outcomes for random events**, which the Storyteller can review and override via the Admin UI.

- **Automated Mode** (`/youare`): The bot acts as the Storyteller and handles all game mechanics. Random events (role assignment, character information, drunk/poisoned outcomes) are resolved automatically. **This feature is WIP and currently not to be counted on**.

## Features

- **Game channel creation** — `!clocktower @player1 @player2 ...` creates a private channel for 5–16 players.
- **Role assignment** — Random draft with full Trouble Brewing distribution rules (Drunk fake role, Red Herring, Imp bluffs). Manual Mode includes a web UI for reviewing and editing the draft.
- **Night phase** — Prompts players via DM for night actions; resolves abilities in order. Manual Mode Storytellers can review and override all information sent to players.
- **Day phase** — Nominations (`/nominate`), voting (`/ye`), end-day consensus (`/endday`), elimination, and win condition checking.
- **Role-specific commands** — Active abilities like Slayer's shot are available as slash commands.
- **Admin UI** — A Next.js web dashboard (Express + SSE) for Manual Mode: role draft editing, night phase control panel, and live game state monitoring.
- **Townsquare integration** — Optional live sync with [clocktower.live](https://clocktower.online) or any other deployment of [@nicholas-eden/townsquare](https://github.com/nicholas-eden/townsquare).
- **Rulebook** — `/rulebook` to look up any Trouble Brewing role in-game.
- **i18n** — English and Simplified Chinese language support (`/lang`).
- **Online Mode** — Guild setting that skips filler night messages for online play.
- **Test mode** — `!ctest` to start a game with synthetic players for solo testing.

## Setup

See [SETUP.md](SETUP.md).

## Usage

Invite the bot to your server, then in any channel:

```
!clocktower @player1 @player2 ... @playerN
```

5–16 players required (storyteller is not counted). The bot creates a private game channel and prompts for storyteller selection.

### Slash Commands

| Command              | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `/iam`               | Claim Storyteller — starts Manual Mode                                  |
| `/youare`            | Let the bot be Storyteller — starts Automated Mode                      |
| `/nominate <player>` | Nominate a living player for execution (day phase)                      |
| `/ye`                | Vote for the currently nominated player                                 |
| `/endday`            | Vote to end the day (or Storyteller ends it immediately)                |
| `/info`              | Show game info: phase, role distribution, win conditions, player status |
| `/link <url>`        | Link a townsquare session for live sync                                 |
| `/rulebook [role]`   | Look up a Trouble Brewing role (omit for full list)                     |
| `/lang <en\|zh>`     | Set your language preference                                            |

Role-specific commands (e.g. `/slayer`) are also registered for active abilities.

### Message Commands

| Command                    | Description                                 |
| -------------------------- | ------------------------------------------- |
| `!clocktower @mentions...` | Start a new game with the mentioned players |
| `!ctest`                   | Start a test game with fake players         |
| `!as <player> <message>`   | (Debug) Impersonate a player                |

### Admin UI

When running in Manual Mode, the Admin UI is available at `http://localhost:3000`. It provides:

- **Role assignment editor** — Swap roles, set the Drunk's fake role, pick the Red Herring, choose Imp bluffs, and validate the draft before distributing.
- **Night control panel** — Review action messages, edit randomized information outcomes, confirm death narratives, and send messages to players.
- **Live game state** — Real-time updates.
- **Guild settings** — Configure guild-specific settings.

## Licensed under AGPL-3.0

Because I support open source software, I'm licensing this source code under the [GNU Affero General Public License v3.0](LICENSE). For those who don't know what that means, **TL;DR**:

**If you deploy this bot (publicly or privately, with or without modification), you must:**

- Make the source code of your version publicly available
- License your changes under AGPL-3.0 as well

**You do NOT have to:**

- Pay me anything
- Ask my permission
