/**
 * Entry point for the daemon mode.
 *
 * Loads config, initialises state, and starts the scheduled agent loop.
 */

import { getConfig } from "./config.js";
import { setLogLevel } from "./utils/logger.js";
import { StateManager } from "./utils/state.js";
import { AgentLoopScheduler } from "./loop/scheduler.js";
import { log } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = getConfig();
  setLogLevel(config.logLevel);

  log.info("Cursor PR Agent Loop starting…");
  log.info(`Repos: ${config.githubRepos.join(", ")}`);

  const state = new StateManager(config.stateFile);
  await state.load();

  const scheduler = new AgentLoopScheduler(config, state);

  // Graceful shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT – shutting down");
    scheduler.stop();
    state.save().then(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM – shutting down");
    scheduler.stop();
    state.save().then(() => process.exit(0));
  });

  await scheduler.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
