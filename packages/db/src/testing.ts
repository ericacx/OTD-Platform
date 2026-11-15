import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./client.js";
import { migrationsFolder } from "./client.js";
import * as schema from "./schema/index.js";
import type { SeedRefs } from "./seed/demo/context.js";
import { seedAll } from "./seed/index.js";

export type SeedLevel = "none" | "reference" | "demo";

const templates = new Map<string, Promise<{ client: PGlite; refs: SeedRefs | null }>>();

async function buildTemplate(seed: SeedLevel, now?: Date): Promise<{ client: PGlite; refs: SeedRefs | null }> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder });
  const refs = seed === "none" ? null : await seedAll(db as unknown as Database, { demo: seed === "demo", ...(now ? { now } : {}) });
  return { client, refs };
}

export async function createTestDatabase(options: { seed?: SeedLevel; now?: Date } = {}): Promise<{ db: Database; refs: SeedRefs | null; close: () => Promise<void> }> {
  const seed = options.seed ?? "none";
  const key = `${seed}:${options.now?.toISOString() ?? ""}`;
  let template = templates.get(key);
  if (!template) {
    template = buildTemplate(seed, options.now);
    templates.set(key, template);
  }
  const { client: base, refs } = await template;
  const client = (await base.clone()) as PGlite;
  const db = drizzle({ client, schema, casing: "snake_case" });
  return { db: db as unknown as Database, refs, close: () => client.close() };
}
