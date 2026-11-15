import type { Database } from "../client.js";
import { seedDemo } from "./demo/index.js";
import { seedReference } from "./reference.js";

export { DEMO_CUSTOMERS, DEMO_PASSWORD, DEMO_USERS, ORG_TREE, PATROL_RULES, SERVICE_CATALOG, seedReference } from "./reference.js";
export { seedDemo } from "./demo/index.js";
export type { SeedContext, SeedRefs } from "./demo/context.js";

export async function seedAll(db: Database, options: { demo?: boolean; now?: Date } = {}) {
  const ref = await seedReference(db);
  if (options.demo !== false) await seedDemo(db, ref, options.now);
  return ref;
}
