# AI Code Board

Multi-machine AI coding session dashboard. Collects and syncs conversation logs from **Claude Code** and **Codex** across multiple machines (Linux, macOS, Windows) into a central web dashboard with real-time updates and remote session control.

## Screenshots

### Dashboard
Overview of all synchronized machines, sessions, and message statistics.

![Dashboard](docs/screenshots/dashboard.png)

### Sessions
Browse all conversation sessions across machines, filtered by source (Claude/Codex), with search and project grouping.

![Sessions](docs/screenshots/sessions.png)

### Session Detail
View full conversation history with message content, timestamps, and the ability to continue conversations remotely.

![Session Detail](docs/screenshots/session-detail.png)

## Architecture

```
Linux/macOS Machine ──┐                                    ┌── Web Dashboard
Windows Machine ──────┼── Agent (WebSocket) ──▶ Server ────┤── REST API
Another Machine ──────┘   (long connection)    (Fastify)    └── WebSocket (live)
```

Each machine runs an **Agent** that:
1. Watches local JSONL chat files (`.claude/projects/`, `.codex/sessions/`)
2. Incrementally syncs new messages to the central **Server** via HTTP
3. Maintains a **WebSocket long connection** to receive remote commands
4. Executes Claude/Codex commands locally and returns results

The agent connects **outbound** to the server — no public IP or open ports needed on client machines. Works behind NAT and firewalls.

## Features

- **Multi-source support** — Claude Code and Codex (GPT) sessions
- **Cross-platform** — Linux, macOS, and Windows agents
- **Incremental sync** — Only reads new bytes from JSONL files using offset tracking
- **Real-time updates** — WebSocket push to dashboard on new messages
- **Multi-machine** — Unique machine ID, IP tracking, heartbeat monitoring
- **Remote execution** — Continue or start Claude/Codex sessions on remote machines
- **Folder grouping** — Sessions organized by project path with collapsible folders
- **Session management** — Star, watch, rename sessions; dedicated collection pages
- **Auto-approve** — Automatically handles trust and permission prompts
- **Systemd integration** — Production-ready with auto-restart and boot startup

## Quick Start

### 1. Install

```bash
git clone https://github.com/grey0758/ai-code-board.git
cd ai-code-board
npm install
npm run build
```

### 2. Start Server

```bash
PORT=3500 npx tsx packages/server/src/index.ts
```

### 3. Start Agent

**Linux / macOS:**
```bash
npx tsx packages/agent/src/index.ts --server http://YOUR_SERVER_IP:3500
```

**Windows:**
```powershell
npx tsx packages/agent-win/src/index.ts --server http://YOUR_SERVER_IP:3500
```

### 4. Open Dashboard

Server serves the web dashboard on the same port:
```
http://YOUR_SERVER_IP:3500
```

Or with nginx reverse proxy on port 5173 (see Deployment section).

## Windows Agent Setup

The Windows agent (`packages/agent-win`) is a standalone package with full Windows compatibility.

### Prerequisites
- Node.js 18+
- Claude Code and/or Codex CLI installed

### Quick Install

```powershell
# Clone and build
git clone https://github.com/grey0758/ai-code-board.git
cd ai-code-board
npm install
npm run build

# Run Windows agent
node packages/agent-win/dist/index.js --server http://YOUR_SERVER_IP:5173
```

### One-click Setup

```powershell
cd packages/agent-win
.\setup.bat
```

### Auto-start on Login (Task Scheduler)

```powershell
schtasks /create /tn "AiCodeBoard" /tr "node C:\path\to\agent-win\dist\index.js --server http://YOUR_SERVER:5173" /sc onlogon /rl highest
```

### Windows vs Linux Agent Differences

| Feature | agent (Linux/macOS) | agent-win (Windows) |
|---------|-------------------|-------------------|
| Machine ID | `/etc/machine-id` | `wmic csproduct get UUID` |
| Shell commands | Single quotes, `< /dev/null` | Double quotes, `cmd.exe` |
| PATH handling | `:` separator, `/usr/local/bin` | `;` separator, `%APPDATA%\npm` |
| Env variables | `HOME`, `USER` | `USERPROFILE`, `USERNAME` |
| Path separators | `/` | `\` (normalized to `/` internally) |
| node-pty | Required | Optional (exec mode works without it) |
| Shutdown signals | SIGINT, SIGTERM | SIGINT, SIGTERM, SIGBREAK |

## Agent Options

| Parameter | Default | Description |
|---|---|---|
| `--server` | `http://localhost:3000` | Central server URL |
| `--dirs` | `~/.claude/projects,~/.codex/sessions` | Watch directories (comma-separated) |
| `--interval` | `3000` | Sync interval in ms |
| `--heartbeat` | `30000` | Heartbeat interval in ms |
| `--ssh-port` | `22` | SSH port (metadata only) |
| `--ssh-user` | current user | SSH username (metadata only) |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/machines` | List all registered machines |
| `PATCH` | `/api/machines/:id` | Rename a machine |
| `GET` | `/api/sessions` | List all conversation sessions |
| `PATCH` | `/api/sessions/:id` | Update session (rename, star, watch) |
| `POST` | `/api/sessions/backfill-first-message` | Backfill first message for all sessions |
| `GET` | `/api/sessions/:id/messages` | Get messages (`?since=N` for incremental) |
| `GET` | `/api/messages/recent` | Recent messages across all sessions |
| `POST` | `/api/register` | Register a machine |
| `POST` | `/api/heartbeat` | Machine heartbeat |
| `POST` | `/api/sync` | Batch sync messages from agent |
| `POST` | `/api/remote/continue` | Continue a session on remote machine |
| `POST` | `/api/remote/new-session` | Start new session on remote machine |
| `POST` | `/api/remote/browse` | Browse remote directory |
| `POST` | `/api/remote/start` | Start interactive PTY session |
| `POST` | `/api/remote/input` | Send input to PTY session |
| `POST` | `/api/remote/kill` | Kill remote session |
| `GET` | `/api/remote/agents` | List connected agents |
| `WS` | `/ws/live` | Dashboard real-time updates |
| `WS` | `/ws/agent` | Agent command channel (long connection) |

## Deployment

### Systemd (Linux Server)

```bash
# Server service
cat > /etc/systemd/system/chat-sync-server.service << EOF
[Unit]
Description=AI Code Board Server
After=network.target
[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/ai-code-board
Environment=PORT=3500
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/node --import file:///path/to/ai-code-board/node_modules/tsx/dist/loader.mjs packages/server/src/index.ts
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

# Agent service (on Linux dev machines)
cat > /etc/systemd/system/chat-sync-agent.service << EOF
[Unit]
Description=AI Code Board Agent
After=network.target
[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/ai-code-board
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/node --import file:///path/to/ai-code-board/node_modules/tsx/dist/loader.mjs packages/agent/src/index.ts --server http://YOUR_SERVER:3500
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now chat-sync-server chat-sync-agent
```

### Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 5173;
    location / {
        proxy_pass http://127.0.0.1:3500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Project Structure

```
ai-code-board/
├── packages/
│   ├── shared/            # Shared TypeScript types
│   ├── server/            # Central server (Fastify + SQLite + WebSocket)
│   │   └── src/
│   │       ├── api/       # REST endpoints (sync, machines, query, remote)
│   │       ├── db/        # Drizzle ORM schema + SQLite
│   │       └── ws/        # WebSocket handlers (dashboard + agent)
│   ├── agent/             # Linux/macOS agent (file watcher + sync)
│   │   └── src/
│   │       ├── parser.ts          # JSONL format parsers (Claude/Codex)
│   │       ├── watcher.ts         # chokidar file watcher
│   │       ├── reader.ts          # Incremental byte-offset reader
│   │       ├── uploader.ts        # Batch HTTP uploader
│   │       ├── command-channel.ts # WebSocket command receiver
│   │       └── remote-session.ts  # PTY-based remote execution
│   ├── agent-win/         # Windows agent (cross-platform compatible)
│   │   ├── src/           # Same structure as agent, Windows-adapted
│   │   ├── install.ps1    # PowerShell installer
│   │   └── setup.bat      # Quick setup script
│   └── web/               # React dashboard (Vite + TailwindCSS)
└── data/                  # SQLite database (auto-created)
```

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **Server**: Fastify 5, better-sqlite3, Drizzle ORM
- **Agent**: chokidar (file watching), node-pty (optional, remote PTY)
- **Web**: React 18, Vite 6, TailwindCSS 3.4, Radix UI, Phosphor Icons
- **Communication**: WebSocket long connection, REST API

## License

MIT
