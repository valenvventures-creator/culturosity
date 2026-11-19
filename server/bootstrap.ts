import type { Deps } from "./context";
import { loadConfig, type ServerConfig } from "./env";
import { createDbFromConfig } from "./db";
import { createStorageFromConfig } from "./adapters/storage";
import { createEmailAdapter } from "./adapters/email";
import { createAiAdapter } from "./adapters/ai";
import { createResearchFetcher } from "./adapters/research";

export async function createDeps(cfg: ServerConfig = loadConfig()): Promise<Deps> {
  const db = await createDbFromConfig(cfg);
  return {
    db,
    config: cfg,
    storage: await createStorageFromConfig(cfg),
    email: createEmailAdapter(cfg),
    ai: createAiAdapter(cfg),
    research: createResearchFetcher({ searchConfigured: Boolean(cfg.anthropicApiKey || cfg.researchProvider) }),
  };
}
