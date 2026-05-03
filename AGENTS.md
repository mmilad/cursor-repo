# Agent and maintainer notes

This repo is a **wrapper hub**: shared Cursor SDK tooling under **`src/`** (including the reusable planner in [`src/shared/planner/`](src/shared/planner/)). **`projects/`** is for **local clones only** — it is **gitignored** and not used for tracked templates (see [`docs/managed-projects.md`](docs/managed-projects.md)).

## Setup

- `npm install`
- Copy [`.env.example`](.env.example) to **`.env`** and set **`CURSOR_API_KEY`**. [`src/load-env.ts`](src/load-env.ts) runs when you import the API from [`src/controller/`](src/controller/) (see [`src/controller/controller.ts`](src/controller/controller.ts)). For cloud template runs you also need a repo URL (`--repo` or **`CURSOR_CLOUD_REPO_URL`**).

## CLI (`npm run cursor -- …`)

```bash
npm run cursor -- list agents
npm run cursor -- list agents --cloud
npm run cursor -- list runs <agentId>
npm run cursor -- ask -- "What is the purpose of this repository?"
npm run cursor -- template planning.v1 --goal "Harden auth flow" [--context "..."] [--stream]
npm run cursor -- template planner --goal "Rollout" [--constraints "..."] [--scope "..."]
npm run cursor -- template planning.v1 --goal "..." --cloud --repo https://github.com/org/repo.git
npm run cursor -- workflow brainstorm --goal "Improve onboarding" [--constraints "..."] [--scope "..."]
```

Workflows live under [`src/workflows/`](src/workflows/) and compose tasks under [`src/tasks/`](src/tasks/); registry: [`src/workflows/registry.ts`](src/workflows/registry.ts).

- **`planner`** / **`shared.planner.v1`** — org planner in [`src/shared/planner/planner-template.ts`](src/shared/planner/planner-template.ts). Variables: `goal`, `context`, `constraints`, `repo`.

Exit codes: `0` success, `1` transport/SDK startup (`CursorAgentError`), `2` run finished with `error` status.

## Programmatic use

```typescript
import { CursorController } from "./src/controller/index.js";
import { customPlannerTemplate, planningTemplate } from "./src/templates/index.js";

const c = new CursorController({ localCwd: process.cwd(), local: { settingSources: [] } });

await c.runTemplate(customPlannerTemplate, {
  runtime: "local",
  variables: { goal: "Ship v1 API", repo: "projects/acme/work" },
});
```

Point **`localCwd`** at a path under **`projects/<slug>/…`** (on your machine) when agents should edit a clone; that directory is not committed (see [`docs/managed-projects.md`](docs/managed-projects.md)).

## Applying this kit elsewhere

Fork this wrapper repo. Add more reusable templates under **`src/shared/`** (or `src/templates/`) and register them in [`src/templates/index.ts`](src/templates/index.ts). Use [`docs/examples/managed-slot/`](docs/examples/managed-slot/) as a copy-paste reference for per-clone `cursor.project.json` under ignored `projects/`.

## Checklists

- [ ] `CURSOR_API_KEY` set; sessions use `withSession` / dispose correctly.
- [ ] Distinguish `CursorAgentError` from `RunResult.status === "error"`.
- [ ] For cloud, pass **`repos`** or set **`cloudDefaults`** on the controller.
- [ ] Do not commit anything under **`projects/`** — clones and pulls stay local.
