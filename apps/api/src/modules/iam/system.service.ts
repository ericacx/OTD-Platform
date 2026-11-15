import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import { type auditLogQuerySchema, iamErrors } from "@otd/contracts/iam";
import { type Database, auditLogs, changeSnapshots, systemParams, users } from "@otd/db";
import { type SQL, and, asc, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService } from "../../core/audit.service.js";
import { AppError, assertFound } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { RoleService } from "./role.service.js";

@Injectable()
export class SystemService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly roles: RoleService,
  ) {}

  async auditLogs(q: z.infer<typeof auditLogQuerySchema>): Promise<Page<unknown>> {
    const conds: SQL[] = [];
    if (q.action) conds.push(eq(auditLogs.action, q.action));
    if (q.objectType) conds.push(eq(auditLogs.objectType, q.objectType));
    if (q.userId) conds.push(eq(auditLogs.userId, q.userId));
    if (q.from) conds.push(gte(auditLogs.at, new Date(q.from)));
    if (q.to) conds.push(lte(auditLogs.at, new Date(q.to)));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(auditLogs.docNo, kw), ilike(auditLogs.userName, kw), ilike(auditLogs.action, kw))!);
    const where = conds.length ? and(...conds) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(auditLogs).where(where))[0]!.n,
      async (limit, offset) =>
        (await this.db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.at)).limit(limit).offset(offset)).map((r) => ({
          id: r.id,
          at: r.at.toISOString(),
          userName: r.userName,
          action: r.action,
          objectType: r.objectType,
          objectId: r.objectId,
          docNo: r.docNo,
          ip: r.ip,
          diff: r.diff,
        })),
    );
  }

  async snapshots(objectType: string, objectId: string) {
    const rows = await this.db.select({ s: changeSnapshots, name: users.name }).from(changeSnapshots).leftJoin(users, eq(users.id, changeSnapshots.createdBy)).where(and(eq(changeSnapshots.objectType, objectType), eq(changeSnapshots.objectId, objectId))).orderBy(desc(changeSnapshots.createdAt));
    return rows.map(({ s, name }) => ({ id: s.id, objectType: s.objectType, objectId: s.objectId, objectVersion: s.objectVersion, reason: s.reason, createdBy: s.createdBy, createdByName: name, createdAt: s.createdAt.toISOString() }));
  }

  async rollback(ctx: AccessContext, snapshotId: string, reason: string): Promise<void> {
    const snap = assertFound((await this.db.select().from(changeSnapshots).where(eq(changeSnapshots.id, snapshotId)))[0]);
    if (snap.objectType === "role") {
      await this.roles.applySnapshot(ctx, snap.objectId, snap.snapshot, `rollback:${snapshotId} ${reason}`);
    } else if (snap.objectType === "systemParam") {
      await this.updateParam(ctx, snap.objectId, snap.snapshot.value, `rollback:${snapshotId} ${reason}`);
    } else {
      throw new AppError(iamErrors.IAM_SNAPSHOT_MISMATCH);
    }
    await this.audit.log(ctx, { action: "iam.snapshot.rollback", objectType: snap.objectType, objectId: snap.objectId, diff: { snapshotId, reason } });
  }

  async params() {
    return (await this.db.select().from(systemParams).orderBy(asc(systemParams.key))).map((p) => ({ key: p.key, value: p.value, description: p.description, updatedAt: p.updatedAt.toISOString() }));
  }

  async param<T>(key: string, fallback: T): Promise<T> {
    const row = (await this.db.select().from(systemParams).where(eq(systemParams.key, key)))[0];
    return row ? (row.value as T) : fallback;
  }

  async updateParam(ctx: AccessContext, key: string, value: unknown, reason?: string) {
    const before = (await this.db.select().from(systemParams).where(eq(systemParams.key, key)))[0];
    if (!before) throw new AppError(iamErrors.IAM_PARAM_UNKNOWN, { key });
    await this.db.transaction(async (tx) => {
      await this.audit.snapshot(ctx, "systemParam", key, 1, { value: before.value }, reason, tx);
      await tx.update(systemParams).set({ value, updatedAt: new Date(), updatedBy: ctx.userId }).where(eq(systemParams.key, key));
      await this.audit.log(ctx, { action: "iam.param.update", objectType: "systemParam", objectId: key, diff: { value: { from: before.value, to: value } } }, tx);
    });
    return (await this.params()).find((p) => p.key === key)!;
  }
}
