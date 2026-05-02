#!/usr/bin/env node
/**
 * Thin CLI over CursorController. Examples:
 *   npm run cursor -- list agents
 *   npm run cursor -- list runs <agentId>
 *   npm run cursor -- ask -- "What does this repo do?"
 *   npm run cursor -- template planning --goal "Add health check endpoint" [--cloud]
 */
import { CursorController } from "../src/cursor/controller.js";
import { CursorAgentError } from "@cursor/sdk";
import { getTemplate } from "../src/templates/index.js";

const repoRoot = process.cwd();

function usage(): never {
  console.error(`Usage:
  npm run cursor -- list agents [--cloud]
  npm run cursor -- list runs <agentId> [--cloud]
  npm run cursor -- ask -- "<message>"
  npm run cursor -- template <templateId> [--goal "..."] [--context "..."] [--constraints "..."] [--scope "..."] [--cloud] [--stream]
  (templateId: planning | planning.v1 | planner | shared.planner.v1)
  (--repo with --cloud: git URL; --scope: free-text repo/scope hint for local planner)

Environment:
  CURSOR_API_KEY           required for all commands
  CURSOR_CLOUD_REPO_URL    optional; used with --cloud when no --repo flag
`);
  process.exit(1);
}

function argv(): string[] {
  return process.argv.slice(2);
}

function flag(name: string, args: string[]): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function optValue(name: string, args: string[]): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i === args.length - 1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function main() {
  const args = argv();
  if (args.length === 0) usage();

  const controller = new CursorController({
    localCwd: repoRoot,
    local: { settingSources: [] },
  });

  const cmd = args.shift();
  if (cmd === "list") {
    const sub = args.shift();
    if (sub === "agents") {
      const cloud = flag("--cloud", args);
      const res = await controller.listAgents(cloud ? { runtime: "cloud" } : { runtime: "local" });
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (sub === "runs") {
      const agentId = args.shift();
      if (!agentId) usage();
      const cloud = flag("--cloud", args);
      const res = await controller.listRuns(
        agentId,
        cloud ? { runtime: "cloud" } : { runtime: "local" },
      );
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    usage();
  }

  if (cmd === "ask") {
    let message: string | undefined;
    const sep = args.indexOf("--");
    if (sep !== -1) {
      message = args.slice(sep + 1).join(" ").trim();
    } else {
      message = args.join(" ").trim();
    }
    if (!message) usage();
    try {
      const result = await controller.askLocal(message);
      console.log(JSON.stringify(result, null, 2));
      if (result.status === "error") process.exitCode = 2;
    } catch (e) {
      if (e instanceof CursorAgentError) {
        console.error(e.message);
        process.exitCode = 1;
      } else throw e;
    }
    return;
  }

  if (cmd === "template") {
    const id = args.shift();
    if (!id) usage();
    const template = getTemplate(id);
    if (!template) {
      console.error(`Unknown template id: ${id}`);
      process.exit(1);
    }
    const cloud = flag("--cloud", args);
    const stream = flag("--stream", args);
    const goal = optValue("--goal", args);
    const context = optValue("--context", args);
    const constraints = optValue("--constraints", args);
    const scope = optValue("--scope", args);
    const repoUrl = optValue("--repo", args) ?? process.env.CURSOR_CLOUD_REPO_URL;

    try {
      if (cloud) {
        if (!repoUrl) {
          console.error("Cloud template needs --repo <git url> or CURSOR_CLOUD_REPO_URL");
          process.exit(1);
        }
        const result = await controller.runTemplate(template, {
          runtime: "cloud",
          cloud: { repos: [{ url: repoUrl }] },
          variables: { goal, context, constraints, repo: scope },
          stream,
          onText: stream ? (t) => process.stdout.write(t) : undefined,
        });
        if (!stream) console.log(JSON.stringify(result, null, 2));
        else console.log("\n", JSON.stringify(result, null, 2));
        if (result.status === "error") process.exitCode = 2;
      } else {
        const result = await controller.runTemplate(template, {
          runtime: "local",
          variables: { goal, context, constraints, repo: scope },
          stream,
          onText: stream ? (t) => process.stdout.write(t) : undefined,
        });
        if (!stream) console.log(JSON.stringify(result, null, 2));
        else console.log("\n", JSON.stringify(result, null, 2));
        if (result.status === "error") process.exitCode = 2;
      }
    } catch (e) {
      if (e instanceof CursorAgentError) {
        console.error(e.message);
        process.exitCode = 1;
      } else throw e;
    }
    return;
  }

  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
