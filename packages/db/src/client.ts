import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Database | Tx;

export type DatabaseHandle = { db: Database; kind: "postgres" | "pglite"; close: () => Promise<void>; migrate: () => Promise<void> };

export const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

export function createDatabase(url: string): DatabaseHandle {
  if (url.startsWith("pglite:")) {
    const location = url.slice("pglite:".length);
    if (location && location !== "memory") mkdirSync(location, { recursive: true });
    const client = new PGlite(location && location !== "memory" ? location : undefined);
    const db = drizzlePglite({ client, schema, casing: "snake_case" });
    return {
      db: db as unknown as Database,
      kind: "pglite",
      close: () => client.close(),
      migrate: () => migratePglite(db, { migrationsFolder }),
    };
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzleNodePg({ client: pool, schema, casing: "snake_case" });
  return {
    db: db as unknown as Database,
    kind: "postgres",
    close: () => pool.end(),
    migrate: () => migrateNodePg(db, { migrationsFolder }),
  };
}
