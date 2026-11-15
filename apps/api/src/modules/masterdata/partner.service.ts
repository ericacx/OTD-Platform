import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import type { AgencyDto, ForwarderDto, MaterialDto, agencyUpsertSchema, forwarderUpsertSchema, masterListQuerySchema, materialUpsertSchema } from "@otd/contracts/masterdata";
import { type Database, forwarders, materials, testAgencies } from "@otd/db";
import { type SQL, and, asc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { assertFound, duplicate, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type ListQuery = z.infer<typeof masterListQuerySchema>;
type MaterialRow = typeof materials.$inferSelect;
type AgencyRow = typeof testAgencies.$inferSelect;
type ForwarderRow = typeof forwarders.$inferSelect;

const toMaterial = (m: MaterialRow): MaterialDto => ({
  id: m.id,
  code: m.code,
  name: m.name,
  category: m.category as MaterialDto["category"],
  spec: m.spec,
  unit: m.unit,
  unitPrice: m.unitPrice,
  currency: m.currency,
  supplier: m.supplier,
  version: m.version,
});
const toAgency = (a: AgencyRow): AgencyDto => ({ id: a.id, code: a.code, name: a.name, city: a.city, contact: a.contact, version: a.version });
const toForwarder = (f: ForwarderRow): ForwarderDto => ({ id: f.id, code: f.code, name: f.name, type: f.type as ForwarderDto["type"], contact: f.contact, version: f.version });

@Injectable()
export class PartnerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async listMaterials(q: ListQuery): Promise<Page<MaterialDto>> {
    const conds: SQL[] = [isNull(materials.deletedAt)];
    if (q.category) conds.push(eq(materials.category, q.category));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(materials.code, kw), ilike(materials.name, kw), ilike(materials.supplier, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(materials).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(materials).where(where).orderBy(asc(materials.category), asc(materials.code)).limit(limit).offset(offset)).map(toMaterial),
    );
  }

  async createMaterial(ctx: AccessContext, input: z.infer<typeof materialUpsertSchema>): Promise<MaterialDto> {
    return toMaterial(
      await this.db.transaction(async (tx) => {
        if ((await tx.select({ id: materials.id }).from(materials).where(eq(materials.code, input.code)))[0]) throw duplicate("code");
        const { version: _v, ...data } = input;
        const created = (await tx.insert(materials).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.material.create", objectType: "material", objectId: created.id, docNo: created.code }, tx);
        return created;
      }),
    );
  }

  async updateMaterial(ctx: AccessContext, id: string, input: z.infer<typeof materialUpsertSchema>): Promise<MaterialDto> {
    return toMaterial(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(materials).where(and(eq(materials.id, id), isNull(materials.deletedAt))))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        if ((await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.code, input.code), ne(materials.id, id))))[0]) throw duplicate("code");
        const { version: _v, ...patch } = input;
        const updated = (await tx.update(materials).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(materials.id, id), eq(materials.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.material.update", objectType: "material", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }

  async removeMaterial(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(materials).where(and(eq(materials.id, id), isNull(materials.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.update(materials).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(materials.id, id));
      await this.audit.log(ctx, { action: "masterdata.material.delete", objectType: "material", objectId: id, docNo: before.code }, tx);
    });
  }

  async listAgencies(q: ListQuery): Promise<Page<AgencyDto>> {
    const conds: SQL[] = [isNull(testAgencies.deletedAt)];
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(testAgencies.code, kw), ilike(testAgencies.name, kw), ilike(testAgencies.city, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(testAgencies).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(testAgencies).where(where).orderBy(asc(testAgencies.code)).limit(limit).offset(offset)).map(toAgency),
    );
  }

  async createAgency(ctx: AccessContext, input: z.infer<typeof agencyUpsertSchema>): Promise<AgencyDto> {
    return toAgency(
      await this.db.transaction(async (tx) => {
        if ((await tx.select({ id: testAgencies.id }).from(testAgencies).where(eq(testAgencies.code, input.code)))[0]) throw duplicate("code");
        const { version: _v, ...data } = input;
        const created = (await tx.insert(testAgencies).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.agency.create", objectType: "testAgency", objectId: created.id, docNo: created.code }, tx);
        return created;
      }),
    );
  }

  async updateAgency(ctx: AccessContext, id: string, input: z.infer<typeof agencyUpsertSchema>): Promise<AgencyDto> {
    return toAgency(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(testAgencies).where(and(eq(testAgencies.id, id), isNull(testAgencies.deletedAt))))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        if ((await tx.select({ id: testAgencies.id }).from(testAgencies).where(and(eq(testAgencies.code, input.code), ne(testAgencies.id, id))))[0]) throw duplicate("code");
        const { version: _v, ...patch } = input;
        const updated = (await tx.update(testAgencies).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(testAgencies.id, id), eq(testAgencies.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.agency.update", objectType: "testAgency", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }

  async removeAgency(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(testAgencies).where(and(eq(testAgencies.id, id), isNull(testAgencies.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.update(testAgencies).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(testAgencies.id, id));
      await this.audit.log(ctx, { action: "masterdata.agency.delete", objectType: "testAgency", objectId: id, docNo: before.code }, tx);
    });
  }

  async listForwarders(q: ListQuery): Promise<Page<ForwarderDto>> {
    const conds: SQL[] = [isNull(forwarders.deletedAt)];
    if (q.type) conds.push(eq(forwarders.type, q.type));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(forwarders.code, kw), ilike(forwarders.name, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(forwarders).where(where))[0]!.n,
      async (limit, offset) => (await this.db.select().from(forwarders).where(where).orderBy(asc(forwarders.type), asc(forwarders.code)).limit(limit).offset(offset)).map(toForwarder),
    );
  }

  async createForwarder(ctx: AccessContext, input: z.infer<typeof forwarderUpsertSchema>): Promise<ForwarderDto> {
    return toForwarder(
      await this.db.transaction(async (tx) => {
        if ((await tx.select({ id: forwarders.id }).from(forwarders).where(eq(forwarders.code, input.code)))[0]) throw duplicate("code");
        const { version: _v, ...data } = input;
        const created = (await tx.insert(forwarders).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "masterdata.forwarder.create", objectType: "forwarder", objectId: created.id, docNo: created.code }, tx);
        return created;
      }),
    );
  }

  async updateForwarder(ctx: AccessContext, id: string, input: z.infer<typeof forwarderUpsertSchema>): Promise<ForwarderDto> {
    return toForwarder(
      await this.db.transaction(async (tx) => {
        const before = assertFound((await tx.select().from(forwarders).where(and(eq(forwarders.id, id), isNull(forwarders.deletedAt))))[0]);
        if (input.version !== undefined && input.version !== before.version) throw versionConflict();
        if ((await tx.select({ id: forwarders.id }).from(forwarders).where(and(eq(forwarders.code, input.code), ne(forwarders.id, id))))[0]) throw duplicate("code");
        const { version: _v, ...patch } = input;
        const updated = (await tx.update(forwarders).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(forwarders.id, id), eq(forwarders.version, before.version))).returning())[0];
        if (!updated) throw versionConflict();
        await this.audit.log(ctx, { action: "masterdata.forwarder.update", objectType: "forwarder", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
        return updated;
      }),
    );
  }

  async removeForwarder(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(forwarders).where(and(eq(forwarders.id, id), isNull(forwarders.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.update(forwarders).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(forwarders.id, id));
      await this.audit.log(ctx, { action: "masterdata.forwarder.delete", objectType: "forwarder", objectId: id, docNo: before.code }, tx);
    });
  }
}
