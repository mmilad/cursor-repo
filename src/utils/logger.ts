import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function timestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function prefix(level: LogLevel): string {
  switch (level) {
    case "debug":
      return chalk.gray(`[${timestamp()}] DEBUG`);
    case "info":
      return chalk.blue(`[${timestamp()}] INFO `);
    case "warn":
      return chalk.yellow(`[${timestamp()}] WARN `);
    case "error":
      return chalk.red(`[${timestamp()}] ERROR`);
  }
}

export const log = {
  debug: (msg: string, ...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(prefix("debug"), msg, ...args);
  },
  info: (msg: string, ...args: unknown[]) => {
    if (shouldLog("info")) console.info(prefix("info"), msg, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(prefix("warn"), msg, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    if (shouldLog("error")) console.error(prefix("error"), msg, ...args);
  },
  success: (msg: string, ...args: unknown[]) => {
    if (shouldLog("info")) console.info(chalk.green(`[${timestamp()}] ✓`), msg, ...args);
  },
};
