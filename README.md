# Blood on the Clocktower Discord Bot

A Discord bot for running **Blood on the Clocktower: Trouble Brewing** games, semi- to fully automatically.

> This bot currently only supports the **Trouble Brewing** script.

> This is a fan-made project. I'm not affiliated with or endorsed by The Pandemonium Institute.

## Mode

The bot supports two modes:

- **Automated Mode**: The bot essentially acts as the Storyteller and handles all game mechanics and rules. Whenever a random event occurs, the bot will automatically resolve it by rolling a dice and picking among the plausible outcomes.

- **Manual Mode**: Some human takes the role of the Storyteller. The bot will handle all the deterministic mechanics, **and suggest outcome resolution for random events**. The Storyteller can intervene in any decision and override the outcome if they wish.

Here, by random events, I'm talking about, for example:

- Role assignment at the beginning of the game, including the Drunk's fake role, the Red Herring, the Bluff Roles, etc.
- The information received by some characters. For example, the two player choice of the Washerwoman.
- The outcome of some abilities under drunk or poisoned conditions.

## Features

The bot can handle:

- Game channel creation
- Role assignment
- Night and Day shifting, with game rules resolution.
- Nominations and voting.
- Elimination, and win condition checking.
- English / Simplified Chinese language support. _That thing is pretty unstable at the moment._

## Setup

See [SETUP.md](SETUP.md).

## Usage

Invite the bot to your server, then in any channel:

```
!clocktower @player1 @player2 ... @playerN
```

5–15 players is required for a game (storyteller is not counted as a player). The bot creates a private game channel and walks everyone through setup.

### Commands

{Coming soon}

## Early PoC

This is an early PoC. I'm aware that some rule details may differ from the official script, and some bugs may exist. Although I don't have a list of known issues at the moment, I seek feedback to improve the bot. You are welcome to open issues or submit PRs.

## Licensed under AGPL-3.0

Because I support open source software, I'm licensing this source code under the [GNU Affero General Public License v3.0](LICENSE). For those who don't know what that means, **TL;DR**:

**If you deploy this bot (publicly or privately, with or without modification), you must:**

- Make the source code of your version publicly available
- License your changes under AGPL-3.0 as well

**You do NOT have to:**

- Pay me anything
- Ask my permission
