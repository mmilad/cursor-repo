# PR Agent Loop – Project Skill

This repository is a fully autonomous PR review and follow-up agent loop
built on the Cursor SDK.

## Architecture

```
src/
  config.ts               – Zod-validated env config
  index.ts                – Daemon entry point
  cli.ts                  – One-shot CLI
  github/
    client.ts             – Octokit wrapper (list PRs, post reviews, merge, etc.)
  cursor/
    agent.ts              – Cursor SDK cloud agent runner
    prompts.ts            – Prompt templates + result parsers
  loop/
    pr-processor.ts       – PR state machine (pending→reviewing→reviewed→merged)
    task-processor.ts     – GitHub Issue task ingestion
    scheduler.ts          – Cron-based main loop
  utils/
    logger.ts             – Coloured console logger
    state.ts              – Persistent JSON state (PR + task tracking)
```

## Key design decisions

- **State machine per PR**: each PR has a status that prevents duplicate work across loop iterations.
- **Cloud agents only**: all review and follow-up work is delegated to Cursor cloud agents that get a fresh VM with the repo checked out.
- **Mobile ingestion**: create a GitHub Issue with the `agent-task` label from your phone → agent picks it up on the next cycle and opens a PR.
- **Auto-merge is opt-in**: disabled by default to keep humans in control.

## Environment variables

See `.env.example` for a full list. Required: `CURSOR_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOS`.

## Running on Raspberry Pi

```bash
# Build multi-arch image
docker buildx build --platform linux/arm64 -t cursor-pr-agent:latest .

# Or simply on the Pi:
docker compose up -d
```
