# The `projects/` directory (clones only)

`projects/` is **not tracked in git** (see root `.gitignore`). Use it only for:

- **Cloned repositories** and working trees you operate on with normal Git commands (`git pull`, `git status`, etc.).
- **Per-checkout state** that should never be committed to this wrapper repo.

Reusable Cursor code, prompts, and templates live under **`src/`** (for example [`src/shared/planner/`](../src/shared/planner/)), not under `projects/`.

## Suggested layout on disk

Each clone or slot is entirely local, e.g.:

```text
projects/
  acme-api/          # created by you locally
    work/            # result of: git clone <url> work
    cursor.project.json   # optional manifest (copy from docs/examples/managed-slot/)
```

Point **`localCwd`** on `CursorController` / the CLI at `projects/<slug>/work` (or the repo root of the clone) when agents should edit that app.

## Adding a new slot

1. Create `projects/<slug>/` (ignored — not in this repo’s commits).
2. Copy [`docs/examples/managed-slot/cursor.project.json`](examples/managed-slot/cursor.project.json) into that folder and edit it.
3. Clone upstream into `projects/<slug>/work` (or another name you prefer and document in the manifest).
