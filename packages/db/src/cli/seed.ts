import { sql } from "drizzle-orm";
import { createDatabase } from "../client.js";
import { seedAll } from "../seed/index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const handle = createDatabase(url);
const existing = await handle.db.execute(sql`select count(*)::int as n from users`);
const count = Number((existing as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
if (count > 0 && !process.argv.includes("--force")) {
  console.warn("database already seeded; pass --force on an empty database only");
} else {
  await seedAll(handle.db, { demo: !process.argv.includes("--no-demo") });
  console.warn("seeded reference and demo data");
}
await handle.close();
