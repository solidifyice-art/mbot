# Minecraft Idle Bot

A small, production-ready Minecraft bot built with **Node.js**, **Mineflayer**, and
**JavaScript (CommonJS)**. It connects to a Minecraft server, stays idle, performs a
short jump routine on a schedule, and reconnects automatically with exponential
backoff. It is designed to be stored on GitHub and deployed to **Render**.

This project does **not** try to bypass authentication, evade anti-cheat, or keep a
free host awake artificially. Use it responsibly and follow each server's rules.

---

## Features

- Configurable Minecraft connection (host, port, username, protocol version, auth).
- Offline-mode friendly (default `MC_AUTH=offline`).
- Idle by default with a periodic, configurable jump routine.
- Anti-AFK random movement (walk bursts, look around, occasional jumps).
- Periodic inventory reporting: logs every non-empty stack (name, count, enchantments).
- Remote **bot shell** over HTTP + WebSocket: status, ASCII map, chat, commands,
  block break/place, creative item grants, and live toggles for walking/jumping.
- Exponential-backoff reconnection with a single reconnect timer.
- Graceful shutdown on `SIGINT` / `SIGTERM`.
- Optional minimal HTTP health endpoint for Render Web Service deployments.
- Structured, timestamped console logs that work with Render's log viewer.
- Zero-database, zero-frontend, minimal dependency footprint.
- Automated tests that never require a live Minecraft server.

---

## 1. Prerequisites

- **Node.js >= 20 (LTS).** Check with `node --version`.
- **npm** (bundled with Node.js).
- **Git** and a **GitHub** account (for deployment).
- A Minecraft server you are allowed to connect a bot to.
- Optional: a **Render** account for hosting.

---

## 2. Local installation

```bash
git clone https://github.com/<your-username>/minecraft-idle-bot.git
cd minecraft-idle-bot
npm install
cp .env.example .env
```

Then edit `.env` (see below).

---

## 3. Configuration

Configuration is read from environment variables. Locally these come from `.env`;
on Render they come from the service's environment settings. **Never commit `.env`.**

| Variable              | Required | Default   | Description                                                        |
| --------------------- | -------- | --------- | ------------------------------------------------------------------ |
| `MC_HOST`             | yes      | —         | Server hostname/IP (no protocol, no port).                         |
| `MC_PORT`             | no       | `25565`   | Server port.                                                       |
| `MC_USERNAME`         | yes      | —         | Bot username.                                                      |
| `MC_VERSION`          | no       | auto      | Client version, e.g. `1.21.11` or `26.1`. Blank = auto-detect from the server. See **Supported versions** below. |
| `MC_AUTH`             | no       | `offline` | `offline`, `microsoft`, or `mojang`.                              |
| `JUMP_INTERVAL_MS`    | no       | `300000`  | Wait between jump routines (5 minutes).                            |
| `JUMP_COUNT`          | no       | `3`       | Jumps per routine.                                                 |
| `JUMP_GAP_MS`         | no       | `1000`    | Approximate spacing between jump presses.                          |
| `JUMP_DURATION_MS`    | no       | `200`     | How long the jump control is held per jump.                        |
| `INVENTORY_CHECK_INTERVAL_MS` | no | `60000` | How often to log the inventory summary. `0` disables.            |
| `ANTI_AFK_INTERVAL_MS`| no       | `120000`  | Random movement interval. `0` disables anti-AFK.                   |
| `ANTI_AFK_MOVE_DURATION_MIN_MS` | no | `1000` | Shortest movement burst.                                          |
| `ANTI_AFK_MOVE_DURATION_MAX_MS` | no | `2000` | Longest movement burst.                                           |
| `ANTI_AFK_LOOK_AROUND_CHANCE` | no | `0.4` | Chance (0-1) to look around after moving.                          |
| `ANTI_AFK_JUMP_CHANCE`| no       | `0.3`     | Chance (0-1) to jump after moving.                                 |
| `RECONNECT_ENABLED`   | no       | `true`    | Enable automatic reconnection.                                     |
| `RECONNECT_INITIAL_MS`| no       | `5000`    | First reconnect delay.                                             |
| `RECONNECT_MAX_MS`    | no       | `300000`  | Maximum reconnect delay.                                           |
| `RECONNECT_FACTOR`    | no       | `2`       | Backoff multiplier per failed attempt.                             |
| `ENABLE_HTTP`         | no       | `false`   | Enable the HTTP endpoint + bot shell (Web Service only).           |
| `PORT`                | no       | `3000`    | Endpoint port (Render sets this automatically).                    |
| `SHELL_TOKEN`         | no       | —         | Secret enabling the remote bot shell. Blank = shell disabled.      |
| `LOG_LEVEL`           | no       | `info`    | `debug`, `info`, `warn`, or `error`.                               |

Invalid values (bad numbers, out-of-range ports, `RECONNECT_MAX_MS` below
`RECONNECT_INITIAL_MS`, `JUMP_DURATION_MS >= JUMP_GAP_MS`, etc.) cause the process to
exit with a clear error instead of connecting with a broken configuration.

### Supported versions

The bot uses **Mineflayer**, which supports Minecraft up to **26.1** (protocol 775).
Newer servers (e.g. **26.2 / protocol 776**) are not yet supported by the underlying
`minecraft-data` package — no public client library has real 26.2 packet tables yet.

To run the bot on a **26.2** server, install the **ViaBackward** plugin (plus
**ViaVersion**) on the server so it can accept older clients, then pin the bot to a
version Mineflayer fully supports:

```dotenv
MC_VERSION=26.1
```

ViaBackward translates the 26.1 client to the 26.2 server. Alternatively use
`MC_VERSION=1.21.11` (protocol 774). Auto-detect only works when the server's
advertised version is itself supported; on a 26.2 server leave `MC_VERSION` set to a
supported value.

---

## 4. Running the bot

```bash
npm start
```

On success you will see logs like:

```
2026-01-01T12:00:00.000Z [INFO] Starting Minecraft idle bot.
2026-01-01T12:00:00.000Z [INFO] Connecting to mc.example.com:25565 as "IdleBot" (attempt 1).
2026-01-01T12:00:01.000Z [INFO] Bot spawned as "IdleBot".
2026-01-01T12:00:01.000Z [INFO] Jump scheduler started; first routine in 300000ms.
```

To run with debug logging:

```bash
LOG_LEVEL=debug npm start
```

Stop it with `Ctrl+C`. The bot logs the shutdown and exits cleanly.

---

## 5. Running the tests

```bash
npm test        # unit tests (no live server required)
npm run check   # static syntax check of all source files
```

The test suite covers configuration validation and defaults, reconnect backoff,
duplicate-reconnect prevention, jump scheduling and cancellation, and graceful
shutdown — using mock bots and deterministic fake timers.

---

## 6. Create and push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Minecraft idle bot"
git branch -M main
git remote add origin https://github.com/<your-username>/minecraft-idle-bot.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules`, and logs. Double-check with
`git status` that no secrets are staged.

---

## 7. Deploying to Render

### Option A — Background Worker (recommended)

A worker is the natural fit for a long-running process with no public HTTP endpoint.
It has no inbound port and no health-check pings.

1. In Render, choose **New > Blueprint** and point it at your repository (it reads
   `render.yaml`), **or** create a **Background Worker** manually:
   - **Environment:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
2. Set `MC_HOST` and `MC_USERNAME` (marked `sync: false` in `render.yaml`, so Render
   prompts for them).
3. Leave `ENABLE_HTTP=false`.

> **Paid requirement:** Render Background Workers require a paid instance type; they
> are **not** available on the free plan. The Blueprint uses `plan: starter`.

### Option B — Web Service (optional)

Only use this if you specifically want a health endpoint. A Web Service gets a public
URL and Render will health-check it.

1. Create a **Web Service** with:
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
2. Set `ENABLE_HTTP=true`. Render provides `PORT` automatically; the server binds to it.
3. The endpoint returns JSON only:

```json
{
  "status": "ok",
  "uptimeMs": 12345,
  "processUptimeMs": 13000,
  "bot": {
    "state": "connected",
    "connected": true,
    "reconnectPending": false,
    "connectionAttempts": 1,
    "connectedForMs": 12000
  }
}
```

The endpoint **never** exposes credentials, environment variables, or raw error text.
A `200` only means the process is alive — it is **not** proof that the Minecraft
connection is healthy; check `bot.connected`.

> **Free-tier caveat:** Render may spin down free Web Services when idle. This project
> deliberately does **not** add fake traffic or self-pinging to work around that
> policy. If you need an always-on process, use a paid instance or a Worker.

Create the service, set the environment variables, and deploy. Render streams the same
console logs shown locally.

### Setting environment variables in Render

Dashboard → your service → **Environment** → add each key/value (at minimum
`MC_HOST`, `MC_USERNAME`; add others as needed). Use `sync: false` in `render.yaml` for
anything you want to enter manually and keep out of the repository. Save — Render
redeploys automatically.

---

## 8. Logs and troubleshooting

Read logs in Render under your service's **Logs** tab, or locally in your terminal.

| Symptom                                   | Likely cause / fix                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `Configuration error: Missing required ...`| `MC_HOST` or `MC_USERNAME` not set.                                             |
| `Configuration error: MC_PORT must be ...` | Port must be 1–65535.                                                           |
| Repeated `Bot error: ...` then backoff     | Server down, wrong host/port, firewall, or unsupported protocol version. Check `MC_VERSION`.
| `Bot was kicked: ...`                      | Server-side kick. Read the reason; it may need whitelisting or a different version. |
| `Not authenticated` / login errors         | Offline auth was rejected, or the server requires a real account. Set `MC_AUTH`. |
| Bot connects then disconnects in a loop    | Anti-idle plugins may kick idle players; expect this on some hosts.             |
| `ECONNREFUSED` / `ENOTFOUND`               | Wrong `MC_HOST`/`MC_PORT` or DNS issue.                                         |
| Worker exits immediately on Render         | Check the Start Command is `npm start` and build logs for errors.               |

---

## 9. How the idle routine and reconnect schedule work

**Idle routine**

1. Five minutes after spawning (`JUMP_INTERVAL_MS`), the bot presses jump for
   `JUMP_DURATION_MS`, releases it, and repeats `JUMP_COUNT` times.
2. Jump presses are approximately `JUMP_GAP_MS` apart. The control is **not** held
   continuously.
3. After the routine, the bot waits `JUMP_INTERVAL_MS` again and repeats.
4. Every pending jump timer is cancelled on disconnect and shutdown. The routine
   resumes from a fresh five-minute wait after a successful reconnection.

**Anti-AFK**

1. Every `ANTI_AFK_INTERVAL_MS` (default two minutes) the bot moves in a random
   direction for a short random burst (`ANTI_AFK_MOVE_DURATION_MIN_MS` ..
   `ANTI_AFK_MOVE_DURATION_MAX_MS`), then releases the control.
2. It randomly looks around (`ANTI_AFK_LOOK_AROUND_CHANCE`) and randomly jumps
   (`ANTI_AFK_JUMP_CHANCE`).
3. This keeps the position changing so servers that kick for inactivity reset their
   timer. Set `ANTI_AFK_INTERVAL_MS=0` to disable, or toggle it live with the shell.

**Reconnection**

1. On an unexpected disconnect, the bot waits `RECONNECT_INITIAL_MS` and retries.
2. Each consecutive failure multiplies the delay by `RECONNECT_FACTOR`, capped at
   `RECONNECT_MAX_MS`.
3. A successful spawn resets the delay back to the initial value.
4. Only **one** reconnect timer can exist at a time, and no reconnect is scheduled
   after an intentional shutdown.

---

## 10. Remote bot shell (bsh)

When `ENABLE_HTTP=true` **and** `SHELL_TOKEN` is set, the bot exposes a remote shell so
you can inspect and control it from anywhere (for example your Render URL). Every shell
route requires the token. Without `SHELL_TOKEN` the routes return `403`, so the endpoint
is never open by accident.

| Route     | Method    | Description                                                       |
| --------- | --------- | ---------------------------------------------------------------- |
| `/health` | GET       | Process + bot health (public, no secrets).                        |
| `/status` | GET       | Manager status plus bot detail (position, gamemode, health, ...). |
| `/map`    | GET       | ASCII surface map. Query `?radius=8`.                             |
| `/feed`   | GET       | Recent chat/event feed. Query `?count=20`.                        |
| `/shell`  | POST      | Run a command. Body `{"command":"where"}`.                        |
| `/ws`     | WebSocket | Live feed + interactive commands.                                |

Pass the token as `?token=…`, the `x-shell-token` header, or `Authorization: Bearer …`.

```bash
BASE=https://your-service.onrender.com
curl "$BASE/status?token=$SHELL_TOKEN"
curl -X POST "$BASE/shell?token=$SHELL_TOKEN" \
  -H 'Content-Type: application/json' -d '{"command":"where"}'
curl "$BASE/map?token=$SHELL_TOKEN&radius=8"
```

**Commands:** `status`, `where`, `map [radius]`, `inv`, `players`, `gamemode`,
`give <item> [count]` (creative only), `break <x> <y> <z>`, `place <x> <y> <z> [item]`,
`say <message>`, `cmd <command>`, `walk on|off`, `jump on|off`, `jumps`, `feed [n]`,
`clear`, `help`.

**WebSocket:** connect to `wss://your-service.onrender.com/ws?token=$SHELL_TOKEN`. The
server sends `{type:"hello", feed:[…]}` on connect, `{type:"feed", entry}` for each new
chat/event, and `{type:"output", ok, output}` per command. Send commands as
`{"command":"where"}` (or a bare string).

> **Security:** the token is the only gate — treat the endpoint as an admin interface,
> use a long random value, and remember everything you send is visible on the server.

---

## 11. Host restrictions, auth, and availability

- **Offline mode is not universal.** `MC_AUTH=offline` works on servers with
  `online-mode=false`. Online-mode servers require a valid Microsoft/Mojang account,
  which this project does not automate.
- **Anti-idle plugins** may kick or limit idle players. This bot does the minimum
  movement needed and does not attempt to evade moderation or anti-cheat.
- **No uptime or anti-kick guarantees.** Reconnection improves resilience but cannot
  overcome bans, whitelists, downtime, or hosting sleep policies.
- **Respect the rules.** Check that the server owner allows bots and that your host's
  acceptable-use policy permits this workload.

---

## 12. Project structure

```
index.js                 Application entry point, signal handling
src/
  bot.js                 Connection lifecycle (Mineflayer bot / BotManager)
  config.js              Environment parsing and validation
  reconnect.js           Exponential backoff + single-timer reconnect manager
  jump-scheduler.js      Periodic jump scheduling and cancellation
  anti-afk.js            Random movement to avoid AFK kicks
  inventory.js           Periodic inventory summary logging
  actions.js             Break/place blocks, chat, gamemode, creative grants
  gameplay.js            Status + ASCII surface map
  shell.js               Remote bot shell (command parsing, feed, live toggles)
  server.js              HTTP health endpoint + shell API + WebSocket
  logger.js              Timestamped console logger
scripts/
  check.js               Static syntax check used by `npm run check`
test/
  *.test.js              Unit tests (mock bot, fake timers)
  support/               Test helpers
.env.example             Documented configuration template
render.yaml              Render Blueprint (Background Worker)
```

---

## License

MIT.
