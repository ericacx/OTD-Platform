import type { Database } from "../../client.js";
import { factories, quoteStrategies, testAgencies } from "../../schema/index.js";
import { type SeedRefs, createSeedContext } from "./context.js";
import { seedDevelopmentDemo } from "./development.js";
import { seedOrderDemo } from "./orders.js";
import { seedPlatformDemo } from "./platform.js";

export async function seedDemo(db: Database, refs: SeedRefs, now = new Date()) {
  const ctx = createSeedContext(db, refs, now);
  for (const f of await db.select().from(factories)) ctx.factories[f.code] = f.id;
  for (const a of await db.select().from(testAgencies)) ctx.agencies[a.code] = a.id;
  for (const s of await db.select().from(quoteStrategies)) ctx.strategies[s.code] = s.id;
  await seedDevelopmentDemo(ctx);
  await seedOrderDemo(ctx);
  await seedPlatformDemo(ctx);
  return ctx;
}
