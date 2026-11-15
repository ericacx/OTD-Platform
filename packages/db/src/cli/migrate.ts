import { createDatabase } from "../client.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required, e.g. postgres://otd:otd@localhost:55432/otd or pglite:.data/pglite");
const handle = createDatabase(url);
await handle.migrate();
await handle.close();
console.warn(`migrated ${handle.kind} database`);
