import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import { type BaseDetailDto, type FactoryDto, type baseUpsertSchema, type factoryUpsertSchema, type masterListQuerySchema, masterdataErrors } from "@otd/contracts/masterdata";
import { type Database, baseMachines, bases, factories } from "@otd/db";
import { type SQL, and, asc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, duplicate, notFound, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type BaseRow = typeof bases.$inferSelect;
type FactoryRow = typeof factories.$inferSelect;
type ListQuery = z.infer<typeof masterListQuerySchema>;

@Injectable()
export class FactoryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async listBases(q: ListQuery): Promise<Page<BaseDetailDto>> {
    const conds: SQL[] = [isNull(bases.deletedAt)];
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(bases.code, kw), ilike(bases.name, kw), ilike(bases.nameEn, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(bases).where(where))[0]!.n,
      async (limit, offset) => this.toBaseDtos(await this.db.select().from(bases).where(where).orderBy(asc(bases.code)).limit(limit).offset(offset)),
    );
  }

  async createBase(ctx: AccessContext, input: z.infer<typeof baseUpsertSchema>): Promise<BaseDetailDto> {
    const row = await this.db.transaction(async (tx) => {
      if ((await tx.select({ id: bases.id }).from(bases).where(eq(bases.code, input.code)))[0]) throw duplicate("code");
      const created = (await tx.insert(bases).values({ code: input.code, name: input.name, nameEn: input.nameEn ?? null, country: input.country, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.base.create", objectType: "base", objectId: created.id, docNo: created.code }, tx);
      return created;
    });
    return (await this.toBaseDtos([row]))[0]!;
  }

  async updateBase(ctx: AccessContext, id: string, input: z.infer<typeof baseUpsertSchema>): Promise<BaseDetailDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(bases).where(and(eq(bases.id, id), isNull(bases.deletedAt))))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      if ((await tx.select({ id: bases.id }).from(bases).where(and(eq(bases.code, input.code), ne(bases.id, id))))[0]) throw duplicate("code");
      const patch = { code: input.code, name: input.name, nameEn: input.nameEn ?? null, country: input.country };
      const updated = (await tx.update(bases).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(bases.id, id), eq(bases.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "masterdata.base.update", objectType: "base", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return (await this.toBaseDtos([row]))[0]!;
  }

  async removeBase(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(bases).where(and(eq(bases.id, id), isNull(bases.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      const facCount = (await tx.select({ n: countAll }).from(factories).where(and(eq(factories.baseId, id), isNull(factories.deletedAt))))[0]!.n;
      const machineCount = (await tx.select({ n: countAll }).from(baseMachines).where(eq(baseMachines.baseId, id)))[0]!.n;
      if (facCount + machineCount > 0) throw new AppError(masterdataErrors.MASTERDATA_IN_USE, { what: before.name, count: facCount + machineCount });
      await tx.update(bases).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(bases.id, id));
      await this.audit.log(ctx, { action: "masterdata.base.delete", objectType: "base", objectId: id, docNo: before.code }, tx);
    });
  }

  async listFactories(q: ListQuery): Promise<Page<FactoryDto>> {
    const conds: SQL[] = [isNull(factories.deletedAt)];
    if (q.baseId) conds.push(eq(factories.baseId, q.baseId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(factories.code, kw), ilike(factories.name, kw), ilike(factories.legalEntity, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(factories).where(where))[0]!.n,
      async (limit, offset) => this.toFactoryDtos(await this.db.select().from(factories).where(where).orderBy(asc(factories.code)).limit(limit).offset(offset)),
    );
  }

  async getFactory(id: string): Promise<FactoryDto> {
    const row = assertFound((await this.db.select().from(factories).where(and(eq(factories.id, id), isNull(factories.deletedAt))))[0]);
    return (await this.toFactoryDtos([row]))[0]!;
  }

  async createFactory(ctx: AccessContext, input: z.infer<typeof factoryUpsertSchema>): Promise<FactoryDto> {
    const row = await this.db.transaction(async (tx) => {
      if (!(await tx.select({ id: bases.id }).from(bases).where(and(eq(bases.id, input.baseId), isNull(bases.deletedAt))))[0]) throw notFound("base");
      if ((await tx.select({ id: factories.id }).from(factories).where(eq(factories.code, input.code)))[0]) throw duplicate("code");
      const created = (await tx.insert(factories).values({ code: input.code, name: input.name, nameEn: input.nameEn ?? null, baseId: input.baseId, legalEntity: input.legalEntity ?? null, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.factory.create", objectType: "factory", objectId: created.id, docNo: created.code }, tx);
      return created;
    });
    return (await this.toFactoryDtos([row]))[0]!;
  }

  async updateFactory(ctx: AccessContext, id: string, input: z.infer<typeof factoryUpsertSchema>): Promise<FactoryDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(factories).where(and(eq(factories.id, id), isNull(factories.deletedAt))))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      if (!(await tx.select({ id: bases.id }).from(bases).where(and(eq(bases.id, input.baseId), isNull(bases.deletedAt))))[0]) throw notFound("base");
      if ((await tx.select({ id: factories.id }).from(factories).where(and(eq(factories.code, input.code), ne(factories.id, id))))[0]) throw duplicate("code");
      const patch = { code: input.code, name: input.name, nameEn: input.nameEn ?? null, baseId: input.baseId, legalEntity: input.legalEntity ?? null };
      const updated = (await tx.update(factories).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(factories.id, id), eq(factories.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "masterdata.factory.update", objectType: "factory", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return (await this.toFactoryDtos([row]))[0]!;
  }

  async removeFactory(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(factories).where(and(eq(factories.id, id), isNull(factories.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.update(factories).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(factories.id, id));
      await this.audit.log(ctx, { action: "masterdata.factory.delete", objectType: "factory", objectId: id, docNo: before.code }, tx);
    });
  }

  private async toBaseDtos(rows: BaseRow[]): Promise<BaseDetailDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const facs = await this.db.select({ baseId: factories.baseId }).from(factories).where(and(inArray(factories.baseId, ids), isNull(factories.deletedAt)));
    const machines = await this.db.select({ baseId: baseMachines.baseId, count: baseMachines.machineCount }).from(baseMachines).where(inArray(baseMachines.baseId, ids));
    return rows.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      nameEn: b.nameEn,
      country: b.country,
      factoryCount: facs.filter((f) => f.baseId === b.id).length,
      machineCount: machines.filter((m) => m.baseId === b.id).reduce((n, m) => n + m.count, 0),
      version: b.version,
    }));
  }

  private async toFactoryDtos(rows: FactoryRow[]): Promise<FactoryDto[]> {
    if (!rows.length) return [];
    const bs = await this.db.select({ id: bases.id, name: bases.name }).from(bases).where(inArray(bases.id, [...new Set(rows.map((r) => r.baseId))]));
    const names = new Map(bs.map((b) => [b.id, b.name]));
    return rows.map((f) => ({ id: f.id, code: f.code, name: f.name, nameEn: f.nameEn, baseId: f.baseId, baseName: names.get(f.baseId) ?? "", legalEntity: f.legalEntity, version: f.version }));
  }
}
