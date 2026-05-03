import type { ModelSelection } from "@cursor/sdk";

/** Default model when config does not set one (local agents require a model). */
export const DEFAULT_MODEL: ModelSelection = { id: "composer-2" };
