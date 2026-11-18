import type { Context } from "hono";
import type { Db } from "./db";
import type { ServerConfig } from "./env";
import type { StorageAdapter } from "./adapters/storage";
import type { EmailAdapter } from "./adapters/email";
import type { AiAdapter } from "./adapters/ai";
import type { ResearchFetcher } from "./adapters/research";

export interface Deps {
  db: Db;
  config: ServerConfig;
  storage: StorageAdapter;
  email: EmailAdapter;
  ai: AiAdapter;
  research: ResearchFetcher;
  now?: () => Date;
}

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  email_verified_at: string | null;
  is_demo: boolean;
}

export interface AppEnv {
  Variables: {
    deps: Deps;
    requestId: string;
    user: SessionUser | null;
    sessionId: string | null;
  };
}

export type Ctx = Context<AppEnv>;
