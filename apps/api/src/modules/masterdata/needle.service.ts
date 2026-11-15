import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import type { BaseMachineDto, NeedleTypeDto, baseMachineWriteSchema, masterListQuerySchema, needleTypeUpsertSchema } from "@otd/contracts/masterdata";
import { type Database, baseMachines, bases, needleTypes } from "@otd/db";
import { type SQL, and, asc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { assertFound, duplicate, notFound, versionConflict } from "../../core/errors.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type NeedleRow = typeof needleTypes.$inferSelect;
type MachineRow = typeof baseMachines.$inferSelect;

@Injectable()
export class NeedleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listNeedles(q: z.infer<typeof masterListQuerySchema>): Promise<Page<NeedleTypeDto>> {
    const kw = likeKeyword(q.keyword);
    const where = kw ? or(ilike(needleTypes.code, kw), ilike(needleTypes.description, kw)) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(needleTypes).where(where))[0]!.n,
      async (limit, offset) => this.toNeedleDtos(await this.db.select().from(needleTypes).where(where).orderBy(asc(needleTypes.needles)).limit(limit).offset(offset)),
    );
  }

  async createNeedle(ctx: AccessContext, input: z.infer<typeof needleTypeUpsertSchema>): Promise<NeedleTypeDto> {
    const row = await this.db.transaction(async (tx) => {
      if ((await tx.select({ id: needleTypes.id }).from(needleTypes).where(eq(needleTypes.code, input.code)))[0]) throw duplicate("code");
      const created = (await tx.insert(needleTypes).values({ code: input.code, needles: input.needles, description: input.description ?? null, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.needle.create", objectType: "needleType", objectId: created.id, docNo: created.code }, tx);
      return created;
    });
    return (await this.toNeedleDtos([row]))[0]!;
  }

  async updateNeedle(ctx: AccessContext, id: string, input: z.infer<typeof needleTypeUpsertSchema>): Promise<NeedleTypeDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(needleTypes).where(eq(needleTypes.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      if ((await tx.select({ id: needleTypes.id }).from(needleTypes).where(and(eq(needleTypes.code, input.code), ne(needleTypes.id, id))))[0]) throw duplicate("code");
      const patch = { code: input.code, needles: input.needles, description: input.description ?? null };
      const updated = (await tx.update(needleTypes).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(needleTypes.id, id), eq(needleTypes.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "masterdata.needle.update", objectType: "needleType", objectId: id, docNo: before.code, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return (await this.toNeedleDtos([row]))[0]!;
  }

  async listMachines(q: z.infer<typeof masterListQuerySchema>): Promise<Page<BaseMachineDto>> {
    const conds: SQL[] = [];
    if (q.baseId) conds.push(eq(baseMachines.baseId, q.baseId));
    const where = conds.length ? and(...conds) : undefined;
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(baseMachines).where(where))[0]!.n,
      async (limit, offset) => this.toMachineDtos(await this.db.select().from(baseMachines).where(where).orderBy(asc(baseMachines.baseId), asc(baseMachines.needleTypeId)).limit(limit).offset(offset)),
    );
  }

  async createMachine(ctx: AccessContext, input: z.infer<typeof baseMachineWriteSchema>): Promise<BaseMachineDto> {
    const row = await this.db.transaction(async (tx) => {
      if (!(await tx.select({ id: bases.id }).from(bases).where(and(eq(bases.id, input.baseId), isNull(bases.deletedAt))))[0]) throw notFound("base");
      if (!(await tx.select({ id: needleTypes.id }).from(needleTypes).where(eq(needleTypes.id, input.needleTypeId)))[0]) throw notFound("needleType");
      if ((await tx.select({ id: baseMachines.id }).from(baseMachines).where(and(eq(baseMachines.baseId, input.baseId), eq(baseMachines.needleTypeId, input.needleTypeId))))[0]) throw duplicate("needleTypeId");
      const created = (await tx.insert(baseMachines).values({ baseId: input.baseId, needleTypeId: input.needleTypeId, machineCount: input.machineCount, dailyOutputPerMachine: input.dailyOutputPerMachine, createdBy: ctx.userId }).returning())[0]!;
      await this.audit.log(ctx, { action: "masterdata.machine.create", objectType: "baseMachine", objectId: created.id, diff: { machineCount: created.machineCount, dailyOutputPerMachine: created.dailyOutputPerMachine } }, tx);
      return created;
    });
    return (await this.toMachineDtos([row]))[0]!;
  }

  async updateMachine(ctx: AccessContext, id: string, input: z.infer<typeof baseMachineWriteSchema>): Promise<BaseMachineDto> {
    const row = await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(baseMachines).where(eq(baseMachines.id, id)))[0]);
      if (input.version !== undefined && input.version !== before.version) throw versionConflict();
      const patch = { machineCount: input.machineCount, dailyOutputPerMachine: input.dailyOutputPerMachine };
      const updated = (await tx.update(baseMachines).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(baseMachines.id, id), eq(baseMachines.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "masterdata.machine.update", objectType: "baseMachine", objectId: id, diff: diffOf(before, patch) }, tx);
      return updated;
    });
    return (await this.toMachineDtos([row]))[0]!;
  }

  async removeMachine(ctx: AccessContext, id: string, version?: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = assertFound((await tx.select().from(baseMachines).where(eq(baseMachines.id, id)))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      await tx.delete(baseMachines).where(eq(baseMachines.id, id));
      await this.audit.log(ctx, { action: "masterdata.machine.delete", objectType: "baseMachine", objectId: id, diff: { baseId: before.baseId, needleTypeId: before.needleTypeId, machineCount: before.machineCount } }, tx);
    });
  }

  private async toNeedleDtos(rows: NeedleRow[]): Promise<NeedleTypeDto[]> {
    if (!rows.length) return [];
    const machines = await this.db
      .select({ needleTypeId: baseMachines.needleTypeId, baseId: baseMachines.baseId, baseName: bases.name, machineCount: baseMachines.machineCount, daily: baseMachines.dailyOutputPerMachine })
      .from(baseMachines)
      .innerJoin(bases, eq(bases.id, baseMachines.baseId))
      .where(and(inArray(baseMachines.needleTypeId, rows.map((r) => r.id)), isNull(bases.deletedAt)))
      .orderBy(asc(bases.code));
    return rows.map((n) => ({
      id: n.id,
      code: n.code,
      needles: n.needles,
      description: n.description,
      machines: machines.filter((m) => m.needleTypeId === n.id).map((m) => ({ baseId: m.baseId, baseName: m.baseName, machineCount: m.machineCount, dailyOutputPerMachine: m.daily })),
      version: n.version,
    }));
  }

  private async toMachineDtos(rows: MachineRow[]): Promise<BaseMachineDto[]> {
    if (!rows.length) return [];
    const bs = await this.db.select({ id: bases.id, code: bases.code, name: bases.name }).from(bases).where(inArray(bases.id, [...new Set(rows.map((r) => r.baseId))]));
    const ns = await this.db.select({ id: needleTypes.id, code: needleTypes.code }).from(needleTypes).where(inArray(needleTypes.id, [...new Set(rows.map((r) => r.needleTypeId))]));
    return rows.map((m) => {
      const b = bs.find((x) => x.id === m.baseId);
      return {
        id: m.id,
        baseId: m.baseId,
        baseCode: b?.code ?? "",
        baseName: b?.name ?? "",
        needleTypeId: m.needleTypeId,
        needleCode: ns.find((x) => x.id === m.needleTypeId)?.code ?? "",
        machineCount: m.machineCount,
        dailyOutputPerMachine: m.dailyOutputPerMachine,
        dailyCapacity: Math.round(m.machineCount * m.dailyOutputPerMachine),
        version: m.version,
      };
    });
  }
}
