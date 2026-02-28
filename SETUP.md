# Bot Setup Guide

## Step 1 — Create a Discord Application

1. Go to https://discord.com/developers/applications and log in.
2. Click **New Application** (top right).
3. Give it a name (e.g., `BotC Storyteller`) and click **Create**.

---

## Step 2 — Create the Bot user

1. In the left sidebar, click **Bot**.
2. Click **Add Bot** → **Yes, do it!**
3. Under **Token**, click **Reset Token** then **Copy** — save this somewhere safe. This is your `DISCORD_TOKEN`.
4. Scroll down to **Privileged Gateway Intents** and enable:
   - **Message Content Intent** ← required for `!clocktower` to read @mentions
5. Click **Save Changes**.

---

## Step 3 — Get your Client ID

1. In the left sidebar, click **General Information**.
2. Copy the **Application ID**. This is your `DISCORD_CLIENT_ID`.

---

## Step 4 — Invite the bot to your server

1. In the left sidebar, click **OAuth2** → **URL Generator**.
2. Under **Scopes**, check:
   - `bot`
   - `applications.commands`
3. Under **Bot Permissions**, check:
   - `Manage Channels` (to create the game channel)
   - `Send Messages`
   - `Read Message History`
   - `View Channels`
4. Copy the generated URL at the bottom and open it in your browser.
5. Select your server from the dropdown and click **Authorize**.

---

## Step 5 — Set up the project

In the project folder, install dependencies:

```bash
cd /path/to/discord-botc
npm install
```

Copy the example env file and fill it in:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
DISCORD_TOKEN=paste_your_token_here
DISCORD_CLIENT_ID=paste_your_client_id_here
DISCORD_GUILD_ID=paste_your_server_id_here   # optional but recommended during setup
```

> **To find your Server ID:** In Discord, go to **Settings → Advanced** and enable **Developer Mode**. Then right-click your server name in the sidebar and click **Copy Server ID**.
>
> Using `DISCORD_GUILD_ID` makes slash commands register instantly (good for testing). Leave it blank to register globally (takes up to 1 hour).

---

## Step 6 — Register slash commands

```bash
npm run deploy
```

You should see:
```
✅ Registered 3 guild command(s) in guild 123456789...
```

---

## Step 7 — Start the bot

```bash
npm run dev
```

You should see:
```
✅ Logged in as BotC Storyteller#1234
```

---

## Step 8 — Test it

In any channel your bot can see, type:

```
!clocktower @Alice @Bob @Charlie @Diana @Eve
```

The bot will create a private `#clocktower-1` channel and mention those players there. Then use `/iam` or `/youare` inside that channel to proceed.

---

## Keeping it running (optional)

For a persistent hosted bot, install [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
npm run build         # compile TypeScript to dist/
pm2 start dist/index.js --name botc
pm2 save
```
