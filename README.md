# cursor-universal-template

A Cursor SDK wrapper hub with a built-in **autonomous PR-agent loop** and reusable planning templates.

## What it does

```
Phone  ──► GitHub Issue (label: agent-task)
                │
                ▼
        ┌───────────────────────────────────────┐
        │  PR-Agent Daemon (cron, every N min)  │
        │  runs on Raspberry Pi / any Linux host│
        └────────────────┬──────────────────────┘
                         │  polls each repo
                         ▼
              Open PRs          Task Issues
                 │                   │
        Review Agent           Implement Agent
        (posts GitHub review)  (commits + opens PR)
                 │
        ┌────────┴──────────┐
        │                   │
    APPROVE          REQUEST_CHANGES
        │                   │
     (auto-merge)    Follow-up Agent
                     (addresses review comments)
```

### PR state machine

```
pending → reviewing → reviewed ─┬─ merging → merged
                                 └─ follow_up → reviewed (loops up to 3×)
```

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/your-org/cursor-universal-template
cd cursor-universal-template

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# edit .env: set CURSOR_API_KEY, GITHUB_TOKEN, GITHUB_REPOS

# 4a. Run one cycle
npm run pr-agent -- cycle

# 4b. Start daemon
npm run pr-agent -- daemon

# 4c. Check status
npm run pr-agent -- status

# 4d. Review a single PR manually
npm run pr-agent -- review owner/repo 42
```

---

## Mobile task workflow

1. Open GitHub on your phone.
2. Create an issue with the label `agent-task` (configurable via `TASK_LABEL`).
3. On the next poll cycle the agent picks it up, implements it, opens a PR, and closes the issue.

---

## Raspberry Pi deployment

```bash
# Copy repo to Pi, then:
sudo bash deploy/install.sh
```

The installer:
- Installs Node.js 22 if needed
- Runs `npm install`
- Copies `.env.example` → `.env` (fill in credentials)
- Installs and enables a **systemd service** (`cursor-pr-agent`)

Useful commands after deploy:

```bash
systemctl status cursor-pr-agent
journalctl -u cursor-pr-agent -f
systemctl restart cursor-pr-agent
```

---

## Configuration (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `CURSOR_API_KEY` | ✓ | — | From [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations) |
| `GITHUB_TOKEN` | ✓ | — | GitHub PAT (`repo`, `issues`, `pull_requests` scopes) |
| `GITHUB_REPOS` | ✓ | — | Comma-separated `owner/repo` list |
| `CURSOR_CLOUD_REPO_URL` | — | — | Git URL for cloud agent runs |
| `LOOP_CRON` | — | `*/5 * * * *` | Cron expression for the daemon |
| `REQUIRED_APPROVALS` | — | `1` | Approvals needed before auto-merge |
| `AUTO_MERGE` | — | `false` | Enable auto-merge after approval threshold |
| `TASK_LABEL` | — | `agent-task` | Issue label for mobile task ingestion |
| `CONCURRENCY_LIMIT` | — | `3` | Max concurrent PR jobs per cycle |
| `LOCAL_CWD` | — | `process.cwd()` | `localCwd` for local Cursor agent runs |

---

## Generic planning / brainstorm CLI

The existing `npm run cursor -- …` CLI is still available for ad-hoc use:

```bash
npm run cursor -- template planning.v1 --goal "Add health check endpoint"
npm run cursor -- workflow brainstorm --goal "Improve onboarding"
npm run cursor -- ask -- "What does this repo do?"
```

See [AGENTS.md](AGENTS.md) for full details.

---

## Project structure

```
src/
  controller/       CursorController (Cursor SDK façade)
  github/           GitHubClient (Octokit wrapper)
  loop/             PR-agent loop: config, state, processors, scheduler
  run/planning/     Multi-step planning pipeline
  shared/planner/   Reusable org planner template
  tasks/            Brainstorm workflow tasks
  templates/        JobTemplate registry (planning + pr-agent)
  workflows/        Workflow orchestration

scripts/
  cursor-cli.ts     Generic Cursor SDK CLI
  pr-agent-cli.ts   PR-agent loop CLI

deploy/
  cursor-pr-agent.service  systemd unit
  install.sh               Raspberry Pi install script
```

---

## Architecture notes

- **No external database** — state is a local `.agent-state.json` file (auto-created; add to `.gitignore`).
- **Idempotent** — head SHA changes reset PR state, preventing stale reviews on updated branches.
- **Prompt templates** are plain TypeScript functions — easy to tune without touching the loop logic.
- **Cloud vs local** — set `CURSOR_CLOUD_REPO_URL` to route agent runs through Cursor Cloud; leave unset for local runs.
