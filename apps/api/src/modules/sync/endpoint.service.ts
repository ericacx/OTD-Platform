import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type SyncConnectionResult,
  type SyncEndpointDto,
  type SyncEndpointKind,
  type SyncProtocol,
  type syncCredentialUpdateSchema,
  type syncEndpointCreateSchema,
  type syncEndpointListQuerySchema,
  type syncEndpointUpdateSchema,
  syncErrors,
} from "@otd/contracts/sync";
import { type Database, type DbOrTx, customers, syncEndpoints, syncTasks, users } from "@otd/db";
import { type SQL, and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { requirePermission } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, duplicate, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { CredentialVault, maskCredential } from "./credential.js";
import { SyncRunner } from "./runner.service.js";
import { assertCustomerVisible, customerVisible } from "./sync.shared.js";

type EndpointRow = typeof syncEndpoints.$inferSelect;
type EndpointInput = z.infer<typeof syncEndpointUpdateSchema> | z.infer<typeof syncEndpointCreateSchema>;

@Injectable()
export class SyncEndpointService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly vault: CredentialVault,
    private readonly runner: SyncRunner,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof syncEndpointListQuerySchema>): Promise<Page<SyncEndpointDto>> {
    const conds: SQL[] = [customerVisible(syncEndpoints.customerId, ctx)];
    if (q.kind) conds.push(eq(syncEndpoints.kind, q.kind));
    if (q.protocol) conds.push(eq(syncEndpoints.protocol, q.protocol));
    if (q.status) conds.push(eq(syncEndpoints.status, q.status));
    if (q.customerId) conds.push(eq(syncEndpoints.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(syncEndpoints.name, kw), ilike(syncEndpoints.code, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(syncEndpoints).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(syncEndpoints).where(where).orderBy(asc(syncEndpoints.kind), asc(syncEndpoints.code)).limit(limit).offset(offset)),
    );
  }

  async find(ctx: AccessContext, id: string, db: DbOrTx = this.db): Promise<EndpointRow> {
    return assertCustomerVisible(ctx, (await db.select().from(syncEndpoints).where(eq(syncEndpoints.id, id)))[0]);
  }

  async get(ctx: AccessContext, id: string): Promise<SyncEndpointDto> {
    return (await this.toDtos([await this.find(ctx, id)]))[0]!;
  }

  private validate(input: { kind: SyncEndpointKind; customerId?: string | null; protocol: SyncProtocol; baseUrl?: string | null }): void {
    if (input.kind === "CUSTOMER" && !input.customerId) throw new AppError(syncErrors.SYNC_CUSTOMER_REQUIRED);
    if ((input.protocol === "REST" || input.protocol === "SFTP") && !input.baseUrl) throw new AppError(syncErrors.SYNC_BASE_URL_REQUIRED, { protocol: input.protocol });
  }

  private values(input: EndpointInput) {
    return {
      name: input.name,
      kind: input.kind,
      customerId: input.customerId ?? null,
      protocol: input.protocol,
      baseUrl: input.baseUrl ?? null,
      contact: input.contact ?? null,
      timeoutMs: input.timeoutMs,
      options: input.options ?? {},
      ownerId: input.ownerId ?? null,
      note: input.note ?? null,
    };
  }

  async create(ctx: AccessContext, input: z.infer<typeof syncEndpointCreateSchema>): Promise<SyncEndpointDto> {
    if (input.credential) requirePermission(ctx, "sync.endpoint.credential");
    this.validate(input);
    const row = await inTransaction(this.db, this.events, async (tx) => {
      if ((await tx.select({ id: syncEndpoints.id }).from(syncEndpoints).where(eq(syncEndpoints.code, input.code))).length) throw duplicate("code");
      const now = this.clock.now();
      const created = (
        await tx
          .insert(syncEndpoints)
          .values({
            code: input.code,
            ...this.values(input),
            ownerId: input.ownerId ?? ctx.userId,
            credential: input.credential ? this.vault.seal(input.credential) : null,
            credentialUpdatedAt: input.credential ? now : null,
            createdBy: ctx.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "sync.endpoint.create", objectType: "syncEndpoint", objectId: created.id, docNo: created.code, diff: { credentialConfigured: !!input.credential } }, tx);
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof syncEndpointUpdateSchema>): Promise<SyncEndpointDto> {
    this.validate(input);
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      const patch = this.values(input);
      const updated = (
        await tx
          .update(syncEndpoints)
          .set({ ...patch, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(syncEndpoints.id, id), eq(syncEndpoints.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sync.endpoint.update", objectType: "syncEndpoint", objectId: id, docNo: before.code, diff: diffOf(before as Record<string, unknown>, patch) }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async updateCredential(ctx: AccessContext, id: string, input: z.infer<typeof syncCredentialUpdateSchema>): Promise<SyncEndpointDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== input.version) throw versionConflict();
      const sealed = input.credential && Object.keys(input.credential).length ? this.vault.seal(input.credential) : null;
      const updated = (
        await tx
          .update(syncEndpoints)
          .set({ credential: sealed, credentialUpdatedAt: sealed ? this.clock.now() : null, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(syncEndpoints.id, id), eq(syncEndpoints.version, input.version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: "sync.endpoint.credential", objectType: "syncEndpoint", objectId: id, docNo: before.code, diff: { fields: sealed ? Object.keys(input.credential!) : [], cleared: !sealed } }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async setStatus(ctx: AccessContext, id: string, status: "ACTIVE" | "DISABLED", version: number): Promise<SyncEndpointDto> {
    const action = status === "ACTIVE" ? "enable" : "disable";
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = await this.find(ctx, id, tx);
      if (before.version !== version) throw versionConflict();
      if (before.status === status) throw illegalTransition(before.status, action);
      const updated = (
        await tx
          .update(syncEndpoints)
          .set({ status, version: before.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(and(eq(syncEndpoints.id, id), eq(syncEndpoints.version, version)))
          .returning()
      )[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: `sync.endpoint.${action}`, objectType: "syncEndpoint", objectId: id, docNo: before.code, diff: { status: { from: before.status, to: status } } }, tx);
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async test(ctx: AccessContext, id: string): Promise<SyncConnectionResult> {
    const endpoint = await this.find(ctx, id);
    const res = await this.runner.adapterFor(endpoint).test();
    const testedAt = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx.update(syncEndpoints).set({ lastTestAt: testedAt, lastTestOk: res.ok, lastTestMessage: res.message, updatedAt: endpoint.updatedAt }).where(eq(syncEndpoints.id, id));
      await this.audit.log(ctx, { action: "sync.endpoint.test", objectType: "syncEndpoint", objectId: id, docNo: endpoint.code, diff: { ok: res.ok, message: res.message } }, tx);
    });
    return { ...res, testedAt: testedAt.toISOString() };
  }

  async toDtos(rows: EndpointRow[]): Promise<SyncEndpointDto[]> {
    if (!rows.length) return [];
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
    const custs = customerIds.length ? await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds)) : [];
    const owners = ownerIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)) : [];
    const counts = await this.db
      .select({ endpointId: syncTasks.endpointId, n: sql<number>`cast(count(*) as int)` })
      .from(syncTasks)
      .where(
        inArray(
          syncTasks.endpointId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(syncTasks.endpointId);
    return rows.map((r) => {
      const plain = this.vault.open(r.credential);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        kind: r.kind as SyncEndpointDto["kind"],
        customerId: r.customerId,
        customerName: custs.find((c) => c.id === r.customerId)?.name ?? null,
        protocol: r.protocol as SyncEndpointDto["protocol"],
        baseUrl: r.baseUrl,
        contact: r.contact,
        timeoutMs: r.timeoutMs,
        options: r.options,
        status: r.status as SyncEndpointDto["status"],
        ownerId: r.ownerId,
        ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? null,
        note: r.note,
        credential: { configured: !!plain, updatedAt: plain ? iso(r.credentialUpdatedAt) : null, masked: maskCredential(plain) },
        lastTest: r.lastTestAt ? { at: r.lastTestAt.toISOString(), ok: r.lastTestOk ?? false, message: r.lastTestMessage } : null,
        taskCount: counts.find((c) => c.endpointId === r.id)?.n ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }
}
