import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import { type EffectiveRulePackDto, RULE_KINDS, type RuleKind, type RulePackDto, type RulePackSnapshotDto, flowErrors, type rulePackListQuerySchema, type rulePackRollbackSchema, type rulePackUpsertSchema } from "@otd/contracts/flow";
import { type Database, type DbOrTx, changeSnapshots, customers, rulePacks, users } from "@otd/db";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer } from "../../core/access/access.types.js";
import { customerScoped } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { AppError, assertFound, duplicate, notFound, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type Row = typeof rulePacks.$inferSelect;

@Injectable()
export class RulePackService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof rulePackListQuerySchema>): Promise<Page<RulePackDto>> {
    const conds: SQL[] = [or(isNull(rulePacks.customerId), customerScoped(rulePacks.customerId, ctx))!];
    if (q.kind) conds.push(eq(rulePacks.kind, q.kind));
    if (q.customerId) conds.push(eq(rulePacks.customerId, q.customerId));
    if (q.scope === "GLOBAL") conds.push(isNull(rulePacks.customerId));
    if (q.scope === "CUSTOMER") conds.push(isNotNull(rulePacks.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(rulePacks.code, kw), ilike(rulePacks.name, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(rulePacks).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(rulePacks).where(where).orderBy(asc(rulePacks.kind), sql`${rulePacks.customerId} nulls first`, asc(rulePacks.code)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<RulePackDto> {
    const row = assertFound((await this.db.select().from(rulePacks).where(eq(rulePacks.id, id)))[0]);
    if (!canSeeCustomer(ctx, row.customerId)) throw notFound();
    return (await this.toDtos([row]))[0]!;
  }

  async effective(ctx: AccessContext, customerId?: string): Promise<EffectiveRulePackDto[]> {
    if (customerId && !canSeeCustomer(ctx, customerId)) throw notFound();
    const rows = await this.db.select().from(rulePacks).where(eq(rulePacks.enabled, true));
    return RULE_KINDS.map((kind) => {
      const base = rows.find((r) => r.kind === kind && r.customerId === null);
      const override = customerId ? rows.find((r) => r.kind === kind && r.customerId === customerId) : undefined;
      return { kind, params: { ...(base?.params ?? {}), ...(override?.params ?? {}) }, defaultPackId: base?.id ?? null, overridePackId: override?.id ?? null };
    });
  }

  async create(ctx: AccessContext, input: z.infer<typeof rulePackUpsertSchema>): Promise<RulePackDto> {
    const row = await this.db.transaction(async (tx) => {
      const customerId = input.customerId ?? null;
      let customerCode: string | null = null;
      if (customerId) {
        const c = (await tx.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.deletedAt))))[0];
        if (!c || !canSeeCustomer(ctx, c.id)) throw notFound();
        customerCode = c.code;
      }
      await this.assertScopeFree(tx, input.kind, customerId);
      const code = input.code ?? (customerCode ? `RP-${input.kind}-${customerCode}` : `RP-${input.kind}`);
      if ((await tx.select({ id: rulePacks.id }).from(rulePacks).where(eq(rulePacks.code, code)))[0]) throw duplicate("code");
      const created = (
        await tx
          .insert(rulePacks)
          .values({ code, kind: input.kind, name: input.name, nameEn: input.nameEn ?? null, customerId, params: input.params, description: input.description ?? null, enabled: input.enabled, createdBy: ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "flow.rulepack.create", objectType: "rulePack", objectId: created.id, docNo: code, diff: { params: created.params } }, tx);
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof rulePackUpsertSchema>): Promise<RulePackDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(rulePacks).where(eq(rulePacks.id, id)))[0]);
      if (!canSeeCustomer(ctx, before.customerId)) throw notFound();
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const patch = { name: input.name, nameEn: input.nameEn ?? null, params: input.params, description: input.description ?? null, enabled: input.enabled };
      await this.audit.snapshot(ctx, "rulePack", id, before.version, { name: before.name, params: before.params, enabled: before.enabled, description: before.description }, input.reason, tx);
      const updated = (await tx.update(rulePacks).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(rulePacks.id, id), eq(rulePacks.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "flow.rulepack.update", objectType: "rulePack", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async remove(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(rulePacks).where(eq(rulePacks.id, id)))[0]);
      if (!canSeeCustomer(ctx, before.customerId)) throw notFound();
      if (version !== undefined && version !== before.version) throw versionConflict();
      if (before.customerId === null) throw new AppError(flowErrors.FLOW_RULEPACK_DEFAULT_LOCKED);
      await this.audit.snapshot(ctx, "rulePack", id, before.version, { name: before.name, params: before.params, enabled: before.enabled, kind: before.kind, customerId: before.customerId, code: before.code }, "delete", tx);
      await tx.delete(rulePacks).where(eq(rulePacks.id, id));
      await this.audit.log(ctx, { action: "flow.rulepack.delete", objectType: "rulePack", objectId: id, docNo: before.code }, tx);
    });
  }

  async snapshots(ctx: AccessContext, id: string): Promise<RulePackSnapshotDto[]> {
    const row = assertFound((await this.db.select().from(rulePacks).where(eq(rulePacks.id, id)))[0]);
    if (!canSeeCustomer(ctx, row.customerId)) throw notFound();
    const rows = await this.db
      .select({ s: changeSnapshots, name: users.name })
      .from(changeSnapshots)
      .leftJoin(users, eq(users.id, changeSnapshots.createdBy))
      .where(and(eq(changeSnapshots.objectType, "rulePack"), eq(changeSnapshots.objectId, id)))
      .orderBy(desc(changeSnapshots.createdAt));
    return rows.map(({ s, name }) => ({ id: s.id, objectVersion: s.objectVersion, reason: s.reason, createdByName: name, createdAt: s.createdAt.toISOString() }));
  }

  async rollback(ctx: AccessContext, id: string, input: z.infer<typeof rulePackRollbackSchema>): Promise<RulePackDto> {
    const row = await this.db.transaction(async (tx) => {
      const snap = assertFound((await tx.select().from(changeSnapshots).where(eq(changeSnapshots.id, input.snapshotId)))[0]);
      if (snap.objectType !== "rulePack" || snap.objectId !== id) throw new AppError(flowErrors.FLOW_RULEPACK_SNAPSHOT_MISMATCH);
      const before = assertFound((await tx.select().from(rulePacks).where(eq(rulePacks.id, id)))[0]);
      if (!canSeeCustomer(ctx, before.customerId)) throw notFound();
      const state = snap.snapshot as { name?: string; params?: Record<string, unknown>; enabled?: boolean; description?: string | null };
      await this.audit.snapshot(ctx, "rulePack", id, before.version, { name: before.name, params: before.params, enabled: before.enabled, description: before.description }, `rollback:${input.snapshotId} ${input.reason}`, tx);
      const patch: Record<string, unknown> = {};
      if (state.name !== undefined) patch.name = state.name;
      if (state.params !== undefined) patch.params = state.params;
      if (state.enabled !== undefined) patch.enabled = state.enabled;
      if (state.description !== undefined) patch.description = state.description;
      const updated = (await tx.update(rulePacks).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(eq(rulePacks.id, id)).returning())[0]!;
      await this.audit.log(
        ctx,
        { action: "flow.rulepack.rollback", objectType: "rulePack", objectId: id, docNo: before.code, diff: { snapshotId: { from: null, to: input.snapshotId }, reason: { from: null, to: input.reason }, ...diffOf(before, patch) } },
        tx,
      );
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private async assertScopeFree(tx: DbOrTx, kind: RuleKind, customerId: string | null, exceptId?: string): Promise<void> {
    const conds: SQL[] = [eq(rulePacks.kind, kind), customerId ? eq(rulePacks.customerId, customerId) : isNull(rulePacks.customerId)];
    if (exceptId) conds.push(ne(rulePacks.id, exceptId));
    if ((await tx.select({ id: rulePacks.id }).from(rulePacks).where(and(...conds)))[0]) throw new AppError(flowErrors.FLOW_RULEPACK_DUPLICATE, { kind });
  }

  private async toDtos(rows: Row[]): Promise<RulePackDto[]> {
    const ids = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const custs = ids.length ? await this.db.select({ id: customers.id, code: customers.code, name: customers.name }).from(customers).where(inArray(customers.id, ids)) : [];
    return rows.map((r) => {
      const c = custs.find((x) => x.id === r.customerId);
      return {
        id: r.id,
        code: r.code,
        kind: r.kind as RuleKind,
        name: r.name,
        nameEn: r.nameEn,
        customerId: r.customerId,
        customerCode: c?.code ?? null,
        customerName: c?.name ?? null,
        params: r.params,
        description: r.description,
        enabled: r.enabled,
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }
}
