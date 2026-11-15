import { Inject, Injectable } from "@nestjs/common";
import { type Database, type DbOrTx, auditLogs, changeSnapshots } from "@otd/db";
import type { AccessContext } from "./access/access.types.js";
import { DB } from "./tokens.js";

export type AuditEntry = {
  action: string;
  objectType?: string;
  objectId?: string;
  docNo?: string | null;
  diff?: Record<string, unknown>;
};

export type RequestMeta = { ip?: string; userAgent?: string; requestId?: string };

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async log(ctx: AccessContext | null, entry: AuditEntry, tx: DbOrTx = this.db, meta: RequestMeta = {}): Promise<void> {
    await tx.insert(auditLogs).values({
      userId: ctx && !ctx.system ? ctx.userId : null,
      userName: ctx?.userName ?? null,
      action: entry.action,
      objectType: entry.objectType ?? null,
      objectId: entry.objectId ?? null,
      docNo: entry.docNo ?? null,
      diff: entry.diff ?? null,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      requestId: meta.requestId ?? null,
    });
  }

  async snapshot(ctx: AccessContext, objectType: string, objectId: string, objectVersion: number, snapshot: Record<string, unknown>, reason?: string, tx: DbOrTx = this.db): Promise<void> {
    await tx.insert(changeSnapshots).values({ objectType, objectId, objectVersion, snapshot, reason: reason ?? null, createdBy: ctx.system ? null : ctx.userId });
  }
}

export function diffOf<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt" || key === "version") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = { from: a ?? null, to: b ?? null };
  }
  return out;
}
