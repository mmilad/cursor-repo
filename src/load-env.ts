import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (directory containing `package.json`), regardless of `process.cwd()`. */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

config({ path: join(packageRoot, ".env") });
