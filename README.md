# Cursor PR Agent Loop

Autonomous PR review, follow-up, and merge loop built on the **[Cursor SDK](https://cursor.com/docs/sdk/typescript)**.

The daemon watches your GitHub repositories every *N* minutes, dispatches cloud agents to review open PRs, runs follow-up tasks (refactors, test additions, etc.), optionally auto-merges, and picks up new tasks you create from your phone as GitHub Issues.

```
Phone  ──► GitHub Issue (label: agent-task)
                │
                ▼
        ┌───────────────┐
        │  Agent Loop   │  (runs on Raspberry Pi / any Linux host)
        │  (Cron every  │
        │   5 minutes)  │
        └───────┬───────┘
                │  list open PRs + task issues
                ▼
        ┌───────────────┐
        │  Cursor Cloud │  Review agent → posts GitHub review
        │  Agent        │  Follow-up agent → commits fixes
        │               │  Task agent → opens new PR
        └───────────────┘
```

## Features

| Feature | Detail |
|---|---|
| PR review | Cloud agent reads changed files, posts a structured code review as a GitHub review |
| Follow-up tasks | Tasks identified during review (refactors, missing tests, etc.) are automatically dispatched to follow-up agents that push commits to the same branch |
| Refinement | If changes are requested, a refinement agent addresses the feedback |
| Auto-merge | Optional – merges approved PRs that pass the approval threshold (disabled by default) |
| Mobile task ingestion | Create a GitHub Issue with the `agent-task` label from your phone → agent picks it up, implements it, opens a PR, and closes the issue |
| Persistent state | A local JSON state file tracks every PR and task so work is never duplicated across restarts |
| Multi-repo | Monitor any number of repositories in a single daemon |

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/mmilad/cursor-repo
cd cursor-repo
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env – at minimum set CURSOR_API_KEY, GITHUB_TOKEN, GITHUB_REPOS
```

Get your Cursor API key at [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations).

Generate a GitHub token at [github.com/settings/tokens](https://github.com/settings/tokens) with scopes: `repo`, `pull_requests`, `issues`.

### 3. Run

```bash
# One-shot cycle (useful for testing)
npm run cli -- cycle

# Start the daemon
npm run cli -- daemon

# Or via the compiled binary
npm run build && node dist/cli.js daemon
```

## CLI reference

```
Commands:
  daemon                          Start the scheduled daemon loop
  cycle                           Run one full cycle immediately
  review <prUrl>                  Review a specific PR by URL
  task <owner/repo> <issueNum>    Dispatch a labeled issue as an agent task
  status                          Print current state summary
```

## Mobile task workflow

1. Open GitHub on your phone
2. Navigate to any of your watched repos
3. Create a new Issue with the label **`agent-task`**
4. Write the task in natural language (title + description)
5. Wait for the next poll cycle (default: 5 minutes) – the agent picks it up, implements it, opens a PR, and closes the issue with a summary

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|---|---|---|
| `CURSOR_API_KEY` | – | **Required.** Cursor API key |
| `GITHUB_TOKEN` | – | **Required.** GitHub PAT |
| `GITHUB_REPOS` | – | **Required.** Comma-separated `owner/repo` list |
| `CURSOR_MODEL` | `composer-2` | Cursor model to use |
| `POLL_INTERVAL_MINUTES` | `5` | How often to check for new PRs/issues |
| `MAX_CONCURRENT_AGENTS` | `3` | Max parallel agents per cycle |
| `AUTO_MERGE` | `false` | Auto-merge approved PRs |
| `MERGE_METHOD` | `squash` | `merge` / `squash` / `rebase` |
| `REQUIRED_APPROVALS` | `1` | Minimum approvals before auto-merge |
| `TASK_LABEL` | `agent-task` | GitHub issue label to watch for tasks |
| `STATE_FILE` | `.agent-state.json` | Path to the persistent state file |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Running on a Raspberry Pi

### Docker (recommended)

```bash
# On your dev machine – build multi-arch image
docker buildx build \
  --platform linux/arm64 \
  -t cursor-pr-agent:latest \
  --push \
  .

# On the Pi
cp .env.example .env   # fill in your credentials
docker compose up -d
docker compose logs -f
```

### Native (Node.js directly on the Pi)

```bash
# Install Node 22 on the Pi
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repo and install
git clone https://github.com/mmilad/cursor-repo
cd cursor-repo
npm install
cp .env.example .env   # edit with your values

# Run as a systemd service (recommended for production)
sudo cp systemd/cursor-pr-agent.service /etc/systemd/system/
sudo systemctl enable --now cursor-pr-agent
```

### Systemd service file

Save as `/etc/systemd/system/cursor-pr-agent.service`:

```ini
[Unit]
Description=Cursor PR Agent Loop
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/cursor-repo
EnvironmentFile=/home/pi/cursor-repo/.env
ExecStart=/usr/bin/node dist/cli.js daemon
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

## Architecture

```
src/
  config.ts               Zod-validated env config (type-safe)
  index.ts                Daemon entry point
  cli.ts                  CLI entry point (manual / one-shot)
  github/
    client.ts             Octokit wrapper
  cursor/
    agent.ts              Cursor SDK cloud agent runner
    prompts.ts            Prompt templates + result parsers
  loop/
    pr-processor.ts       PR state machine
    task-processor.ts     GitHub Issue task ingestion
    scheduler.ts          Cron-based main loop
  utils/
    logger.ts             Coloured console logger
    state.ts              Persistent JSON state manager
```

### PR state machine

```
pending ──► reviewing ──► reviewed ──┬──► merging ──► merged
                                     │
                                     ├──► follow_up ──► reviewed (loop back)
                                     │
                                     └──► (wait for author if changes requested)
```

## Security notes

- The `CURSOR_API_KEY` and `GITHUB_TOKEN` are injected as environment variables and never logged.
- Auto-merge is **disabled by default**. Enable it only in repos where you trust the review quality.
- The agent loop does not push directly to `main` – all agent work happens on feature branches (or the PR's head branch for follow-ups).
- Secrets passed via `cloud.envVars` in the Cursor SDK are encrypted at rest and injected only into that agent's VM.

## License

MIT
