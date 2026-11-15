import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type SyncMappingDto,
  type SyncMappingField,
  type SyncMappingPreviewResult,
  type SyncObject,
  type syncMappingCreateSchema,
  type syncMappingListQuerySchema,
  type syncMappingPreviewSchema,
  type syncMappingUpdateSchema,
} from "@otd/contracts/sync";
import { type Database, type DbOrTx, syncEndpoints, syncMappings, syncTasks } from "@otd/db";
import { type SQL, and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { badRequest, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import type { MockOptions } from "./adapters.js";
import { SyncEndpointService } from "./endpoint.service.js";
import { applyMapping } from "./mapping.js";
import { loadLocal } from "./sources.js";
import { customerVisible } from "./sync.shared.js";

type MappingRow = typeof syncMappings.$inferSelect;

@Injectable()
export class SyncMappingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly endpoints: SyncEndpointService,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof syncMappingListQuerySchema>): Promise<Page<SyncMappingDto>> {
    const conds: SQL[] = [customerVisible(syncEndpoints.customerId, ctx)];
    if (q.endpointId) conds.push(eq(syncMappings.endpointId, q.endpointId));
    if (q.object) conds.push(eq(syncMappings.object, q.object));
    if (q.direction) conds.push(eq(syncMappings.direction, q.direction));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(ilike(syncMappings.name, kw));
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(syncMappings).innerJoin(syncEndpoints, eq(syncEndpoints.id, syncMappings.endpointId)).where(where))[0]!.n,
      async (limit, offset) =>
        this.toDtos(
          (
            await this.db
              .select({ m: syncMappings })
              .from(syncMappings)
              .innerJoin(syncEndpoints, eq(syncEndpoints.id, syncMappings.endpointId))
              .where(where)
              .orderBy(asc(syncEndpoints.code), asc(syncMappings.object))
              .limit(limit)
              .offset(offset)
          ).map((r) => r.m),
        ),
    );
  }

  async find(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<MappingRow> {
    const row = (await db.select().from(syncMappings).where(eq(syncMappings.id, id)))[0];
    if (!row) throw notFound();
    await this.endpoints.find(ctx, row.endpointId, db);
    return row;
  }

  async get(ctx: AccessContext, id: string): Promise<SyncMappingDto> {
    return (await this.toDtos([await this.find(ctx, id)]))[0]!;
  }

  async create(ctx: AccessContext, input: z.infer<typeof syncMappingCreateSchema>): Promise<SyncMappingDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      await this.endpoints.find(ctx, input.endpointId, tx);
      const now = this.clock.now();
      const created = (
        await tx
          .insert(syncMappings)
          .values({ name: input.name, endpointId: input.endpointId, object: input.object, direction: input.direction, keyField: input.keyField ?? null, fields: input.fields, codeMaps: input.codeMaps, enabled: input.enabled, createdBy: ctx.userId, createdAt: now, updatedAt: now })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "sync.mapping.create", objectType: "syncMapping", objectId: created.id, diff: { name: input.name, fields: input.fields.length } }, tx);
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof syncMappingUpdateSchema>): Promise<SyncMappingDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      if (input.endpointId !== before.endpointId) await this.endpoints.find(ctx, input.endpointId, tx);
      const patch = { name: input.name, endpointId: input.endpointId, object: input.object, direction: input.direction, keyField: input.keyField ?? null, fields: input.fields, codeMaps: input.codeMaps, enabled: input.enabled };
      const updated = (
        await tx
          .update(syncMappings)
          .set({ ...patch, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(syncMappings.id, id), eq(syncMappings.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.snapshot(ctx, "syncMapping", id, before.version, { ...before, createdAt: before.createdAt.toISOString(), updatedAt: before.updatedAt.toISOString() }, "update", tx);
      await this.audit.log(ctx, { action: "sync.mapping.update", objectType: "syncMapping", objectId: id, diff: diffOf(before as Record<string, unknown>, patch) }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async preview(ctx: AccessContext, input: z.infer<typeof syncMappingPreviewSchema>): Promise<SyncMappingPreviewResult> {
    const mapping = input.mappingId ? await this.find(ctx, input.mappingId) : null;
    const fields = input.fields ?? ((mapping?.fields ?? []) as SyncMappingField[]);
    const codeMaps = input.codeMaps ?? mapping?.codeMaps ?? {};
    let sample = input.sample ?? null;
    if (!sample && mapping) sample = await this.sampleFor(ctx, mapping);
    if (!sample && input.object) sample = (await loadLocal(this.db, input.object, { latest: 1 }))[0]?.data ?? null;
    if (!sample) throw badRequest("没有可用的样例数据，请提供 sample");
    const res = applyMapping(fields, codeMaps, sample);
    return { sample, output: res.output, errors: res.errors, ok: res.ok };
  }

  private async sampleFor(ctx: AccessContext, mapping: MappingRow): Promise<Record<string, unknown> | null> {
    const endpoint = await this.endpoints.find(ctx, mapping.endpointId);
    if (mapping.direction === "PUSH") return (await loadLocal(this.db, mapping.object as SyncObject, { customerId: endpoint.customerId, latest: 1 }))[0]?.data ?? null;
    const mock = endpoint.options.mock as MockOptions | undefined;
    return mock?.dataset?.[0]?.data ?? null;
  }

  private async toDtos(rows: MappingRow[]): Promise<SyncMappingDto[]> {
    if (!rows.length) return [];
    const eps = await this.db
      .select({ id: syncEndpoints.id, name: syncEndpoints.name })
      .from(syncEndpoints)
      .where(inArray(syncEndpoints.id, [...new Set(rows.map((r) => r.endpointId))]));
    const counts = await this.db
      .select({ mappingId: syncTasks.mappingId, n: sql<number>`cast(count(*) as int)` })
      .from(syncTasks)
      .where(
        inArray(
          syncTasks.mappingId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(syncTasks.mappingId);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      endpointId: r.endpointId,
      endpointName: eps.find((e) => e.id === r.endpointId)?.name ?? "",
      object: r.object as SyncMappingDto["object"],
      direction: r.direction as SyncMappingDto["direction"],
      keyField: r.keyField,
      fields: r.fields as SyncMappingField[],
      codeMaps: r.codeMaps,
      enabled: r.enabled,
      taskCount: counts.find((c) => c.mappingId === r.id)?.n ?? 0,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
    }));
  }
}
