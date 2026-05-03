---
name: setup-project
description: >-
  Bootstraps a new managed line of work under projects/<slug>/ in this wrapper hub:
  create the ignored directory, copy manifest files from docs/examples/managed-slot/,
  clone the upstream Git repo into a subdirectory (convention: work/). Use when the
  user wants to add a new managed project, clone a repository into projects/, create
  projects/<slug>, set up a project slot, or point automation at a new checkout via localCwd.
---

# Setup project (wrapper hub)

`projects/` is **gitignored** — it holds **clones and git operations only** (see [`docs/managed-projects.md`](../../../docs/managed-projects.md)). Tracked templates and SDK code live under **`src/`**, not under `projects/`.

Root tooling uses `localCwd` pointed at the clone (e.g. `projects/<slug>/work`) when agents should edit app code (see [`AGENTS.md`](../../../AGENTS.md)).

## Workflow (minimal)

1. **Pick a slug** — short, URL-safe directory name (e.g. `acme-api`, `client-portal`).
2. **Create the slot** — at repo root, create `projects/<slug>/` (local only; not committed).
3. **Manifest** — copy [`docs/examples/managed-slot/cursor.project.json`](../../../docs/examples/managed-slot/cursor.project.json) to `projects/<slug>/cursor.project.json` and edit `name`, `gitUrl`, `defaultBranch`, `description`, optional `sharedTemplates` / `notes`.
4. **Clone upstream** — from `projects/<slug>/`, clone into a subdirectory (recommended: `work/`):

   ```bash
   cd projects/<slug>
   git clone <gitUrl> work
   ```

5. **Automation** — when running the Cursor CLI or `CursorController`, set `localCwd` to `projects/<slug>/work` (or whatever path you documented in `notes`).

Enhance later with scripts, worktrees, or CI; this skill only encodes the hub convention.

## Example (concrete)

Goal: managed slot `acme-api` for `https://github.com/org/acme-api.git`.

**PowerShell (repo root):**

```powershell
New-Item -ItemType Directory -Force projects\acme-api | Out-Null
Copy-Item docs\examples\managed-slot\cursor.project.json projects\acme-api\
```

Edit `projects\acme-api\cursor.project.json` — set `name`, `gitUrl`, `description`.

```powershell
Set-Location projects\acme-api
git clone https://github.com/org/acme-api.git work
```

**POSIX shell (repo root):**

```bash
mkdir -p projects/acme-api
cp docs/examples/managed-slot/cursor.project.json projects/acme-api/
# edit projects/acme-api/cursor.project.json
cd projects/acme-api && git clone https://github.com/org/acme-api.git work
```

## Checks

- `projects/<slug>/` exists locally and contains `cursor.project.json` (and optional extra files you add).
- `git clone` target is **inside** `projects/<slug>/`, not the monorepo root, unless the user explicitly asked otherwise.
- Do not commit secrets; use placeholders in examples and in `cursor.project.json` if needed.
