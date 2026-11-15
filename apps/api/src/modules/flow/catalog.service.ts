import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type ServiceItemDto,
  type ServiceModuleDetailDto,
  type ServiceModuleDto,
  flowErrors,
  type serviceItemUpsertSchema,
  type serviceModuleListQuerySchema,
  type serviceModuleUpsertSchema,
} from "@otd/contracts/flow";
import { type Database, type DbOrTx, type FlowSnapshot, customerFlowVersions, customerFlows, customers, serviceItems, serviceModules } from "@otd/db";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, duplicate, versionConflict } from "../../core/errors.js";
import { likeKeyword } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { NODE_ORDER } from "./flow-rules.js";

type ModuleRow = typeof serviceModules.$inferSelect;
type ItemRow = typeof serviceItems.$inferSelect;

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async listModules(q: z.infer<typeof serviceModuleListQuerySchema>): Promise<Page<ServiceModuleDto>> {
    const conds = [isNull(serviceModules.deletedAt)];
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(serviceModules.code, kw), ilike(serviceModules.name, kw), ilike(serviceModules.nameEn, kw))!);
    if (q.hasPage) conds.push(eq(serviceModules.hasPage, q.hasPage === "true"));
    const rows = await this.db.select().from(serviceModules).where(and(...conds)).orderBy(asc(serviceModules.sort), asc(serviceModules.code));
    const dtos = await this.toModuleDtos(rows);
    const start = (q.page - 1) * q.pageSize;
    return { items: dtos.slice(start, start + q.pageSize), total: dtos.length, page: q.page, pageSize: q.pageSize };
  }

  async getModule(id: string): Promise<ServiceModuleDetailDto> {
    const row = assertFound((await this.db.select().from(serviceModules).where(and(eq(serviceModules.id, id), isNull(serviceModules.deletedAt))))[0]);
    const [dto] = await this.toModuleDtos([row]);
    const items = await this.db.select().from(serviceItems).where(and(eq(serviceItems.moduleId, id), isNull(serviceItems.deletedAt))).orderBy(asc(serviceItems.sort), asc(serviceItems.code));
    return { ...dto!, items: items.map((i) => toItemDto(i, row.code)) };
  }

  async createModule(ctx: AccessContext, input: z.infer<typeof serviceModuleUpsertSchema>): Promise<ServiceModuleDetailDto> {
    const id = await this.db.transaction(async (tx) => {
      const all = await tx.select({ code: serviceModules.code, sort: serviceModules.sort }).from(serviceModules);
      const code = input.code ?? nextCode("SM", all.map((m) => m.code), 2);
      if (all.some((m) => m.code === code)) throw duplicate("code");
      const sort = input.sort ?? Math.max(0, ...all.map((m) => m.sort)) + 1;
      const created = (
        await tx
          .insert(serviceModules)
          .values({ code, name: input.name, nameEn: input.nameEn ?? null, department: input.department, sort, hasPage: input.hasPage, description: input.description ?? null, createdBy: ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "flow.module.create", objectType: "serviceModule", objectId: created.id, docNo: code }, tx);
      return created.id;
    });
    return this.getModule(id);
  }

  async updateModule(ctx: AccessContext, id: string, input: z.infer<typeof serviceModuleUpsertSchema>): Promise<ServiceModuleDetailDto> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(serviceModules).where(and(eq(serviceModules.id, id), isNull(serviceModules.deletedAt))))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const patch = { name: input.name, nameEn: input.nameEn ?? null, department: input.department, sort: input.sort ?? before.sort, hasPage: input.hasPage, description: input.description ?? null };
      const updated = await tx.update(serviceModules).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(serviceModules.id, id), eq(serviceModules.version, before.version))).returning();
      if (!updated.length) throw versionConflict();
      await this.audit.log(ctx, { action: "flow.module.update", objectType: "serviceModule", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
    });
    return this.getModule(id);
  }

  async removeModule(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(serviceModules).where(and(eq(serviceModules.id, id), isNull(serviceModules.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      const count = await this.usage(tx, (s) => s.modules.some((m) => m.moduleCode === before.code));
      if (count) throw new AppError(flowErrors.FLOW_CATALOG_IN_USE, { name: before.name, count });
      await tx.update(serviceModules).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(serviceModules.id, id));
      await tx.update(serviceItems).set({ deletedAt: this.clock.now(), updatedBy: ctx.userId }).where(and(eq(serviceItems.moduleId, id), isNull(serviceItems.deletedAt)));
      await this.audit.log(ctx, { action: "flow.module.delete", objectType: "serviceModule", objectId: id, docNo: before.code }, tx);
    });
  }

  async createItem(ctx: AccessContext, moduleId: string, input: z.infer<typeof serviceItemUpsertSchema>): Promise<ServiceItemDto> {
    const row = await this.db.transaction(async (tx) => {
      const mod = assertFound((await tx.select().from(serviceModules).where(and(eq(serviceModules.id, moduleId), isNull(serviceModules.deletedAt))))[0]);
      const all = await tx.select({ code: serviceItems.code, sort: serviceItems.sort, moduleId: serviceItems.moduleId }).from(serviceItems);
      const code = input.code ?? nextCode(`${mod.code}-`, all.map((i) => i.code), 2);
      if (all.some((i) => i.code === code)) throw duplicate("code");
      const sort = input.sort ?? Math.max(0, ...all.filter((i) => i.moduleId === moduleId).map((i) => i.sort)) + 1;
      const created = (
        await tx
          .insert(serviceItems)
          .values({
            moduleId,
            code,
            name: input.name,
            nameEn: input.nameEn ?? null,
            description: input.description ?? null,
            department: input.department ?? null,
            requiresCustomerConfirm: input.requiresCustomerConfirm,
            effects: normalizeEffects(input.effects),
            paramsSchema: input.paramsSchema ?? null,
            sort,
            createdBy: ctx.userId,
          })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "flow.item.create", objectType: "serviceItem", objectId: created.id, docNo: code }, tx);
      return { row: created, moduleCode: mod.code };
    });
    return toItemDto(row.row, row.moduleCode);
  }

  async updateItem(ctx: AccessContext, id: string, input: z.infer<typeof serviceItemUpsertSchema>): Promise<ServiceItemDto> {
    const result = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(serviceItems).where(and(eq(serviceItems.id, id), isNull(serviceItems.deletedAt))))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const mod = (await tx.select({ code: serviceModules.code }).from(serviceModules).where(eq(serviceModules.id, before.moduleId)))[0]!;
      const patch = {
        name: input.name,
        nameEn: input.nameEn ?? null,
        description: input.description ?? null,
        department: input.department ?? null,
        requiresCustomerConfirm: input.requiresCustomerConfirm,
        effects: normalizeEffects(input.effects),
        paramsSchema: input.paramsSchema ?? null,
        sort: input.sort ?? before.sort,
      };
      const updated = (await tx.update(serviceItems).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(serviceItems.id, id), eq(serviceItems.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "flow.item.update", objectType: "serviceItem", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return { row: updated, moduleCode: mod.code };
    });
    return toItemDto(result.row, result.moduleCode);
  }

  async removeItem(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(serviceItems).where(and(eq(serviceItems.id, id), isNull(serviceItems.deletedAt))))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      const count = await this.usage(tx, (s) => s.modules.some((m) => m.items.some((i) => i.itemCode === before.code)));
      if (count) throw new AppError(flowErrors.FLOW_CATALOG_IN_USE, { name: before.name, count });
      await tx.update(serviceItems).set({ deletedAt: this.clock.now(), version: before.version + 1, updatedBy: ctx.userId }).where(eq(serviceItems.id, id));
      await this.audit.log(ctx, { action: "flow.item.delete", objectType: "serviceItem", objectId: id, docNo: before.code }, tx);
    });
  }

  private async usage(db: DbOrTx, uses: (s: FlowSnapshot) => boolean): Promise<number> {
    const rows = await db
      .select({ customerId: customerFlows.customerId, draft: customerFlows.draft, current: customerFlowVersions.snapshot })
      .from(customerFlows)
      .innerJoin(customers, eq(customers.id, customerFlows.customerId))
      .leftJoin(customerFlowVersions, eq(customerFlowVersions.id, customerFlows.currentVersionId))
      .where(isNull(customers.deletedAt));
    return rows.filter((r) => uses(r.draft) || (r.current ? uses(r.current) : false)).length;
  }

  private async toModuleDtos(rows: ModuleRow[]): Promise<ServiceModuleDto[]> {
    if (!rows.length) return [];
    const items = await this.db.select({ moduleId: serviceItems.moduleId, effects: serviceItems.effects }).from(serviceItems).where(isNull(serviceItems.deletedAt));
    const current = await this.db
      .select({ snapshot: customerFlowVersions.snapshot })
      .from(customerFlows)
      .innerJoin(customerFlowVersions, eq(customerFlowVersions.id, customerFlows.currentVersionId))
      .innerJoin(customers, eq(customers.id, customerFlows.customerId))
      .where(isNull(customers.deletedAt));
    return rows.map((m) => {
      const own = items.filter((i) => i.moduleId === m.id);
      const nodes = new Set(own.flatMap((i) => i.effects.nodes ?? []));
      const using = current.map((c) => c.snapshot.modules.find((x) => x.moduleCode === m.code)).filter((x): x is FlowSnapshot["modules"][number] => !!x);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        nameEn: m.nameEn,
        department: m.department,
        sort: m.sort,
        hasPage: m.hasPage,
        description: m.description,
        nodes: NODE_ORDER.filter((n) => nodes.has(n)),
        itemCount: own.length,
        customerCount: m.hasPage ? using.length : null,
        enabledItemTotal: m.hasPage ? using.reduce((n, x) => n + x.items.length, 0) : null,
        version: m.version,
      };
    });
  }
}

export function toItemDto(i: ItemRow, moduleCode: string): ServiceItemDto {
  return {
    id: i.id,
    moduleId: i.moduleId,
    moduleCode,
    code: i.code,
    name: i.name,
    nameEn: i.nameEn,
    description: i.description,
    department: i.department,
    requiresCustomerConfirm: i.requiresCustomerConfirm,
    effects: i.effects,
    paramsSchema: i.paramsSchema ?? null,
    sort: i.sort,
    version: i.version,
  };
}

function normalizeEffects(e: z.infer<typeof serviceItemUpsertSchema>["effects"]) {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(e)) if (v && v.length) out[k] = [...new Set(v)];
  return out;
}

function nextCode(prefix: string, existing: string[], width: number): string {
  let max = 0;
  for (const c of existing) {
    if (!c.startsWith(prefix)) continue;
    const n = Number(c.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}
