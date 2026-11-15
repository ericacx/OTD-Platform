import { sql } from "drizzle-orm";
import type { DbOrTx } from "./client.js";
import { numberSequences } from "./schema/index.js";

export async function nextSequence(db: DbOrTx, prefix: string, period: string): Promise<number> {
  const rows = await db
    .insert(numberSequences)
    .values({ prefix, period, current: 1 })
    .onConflictDoUpdate({ target: [numberSequences.prefix, numberSequences.period], set: { current: sql`${numberSequences.current} + 1` } })
    .returning({ current: numberSequences.current });
  return rows[0]!.current;
}
