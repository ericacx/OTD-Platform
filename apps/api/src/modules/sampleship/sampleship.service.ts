import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type RecipientDto,
  type SampleShipmentDto,
  type recipientUpsertSchema,
  type sampleShipmentCreateSchema,
  type sampleShipmentListQuerySchema,
  sampleshipErrors,
} from "@otd/contracts/sampleship";
import { type Database, type DbOrTx, customers, sampleRecipients, sampleShipments, styles, users } from "@otd/db";
import { canTransition } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { assertCanSee, customerScoped, ownership, scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type ShipmentRow = typeof sampleShipments.$inferSelect;
type RecipientRow = typeof sampleRecipients.$inferSelect;

@Injectable()
export class SampleShipService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async listRecipients(ctx: AccessContext, customerId?: string): Promise<RecipientDto[]> {
    const conds: SQL[] = [customerScoped(sampleRecipients.customerId, ctx)];
    if (customerId) conds.push(eq(sampleRecipients.customerId, customerId));
    const rows = await this.db.select().from(sampleRecipients).where(and(...conds)).orderBy(asc(sampleRecipients.company));
    return this.toRecipients(rows);
  }

  async upsertRecipient(ctx: AccessContext, id: string | null, input: z.infer<typeof recipientUpsertSchema>): Promise<RecipientDto> {
    const row = await this.db.transaction(async (tx) => {
      if (input.isDefault) await tx.update(sampleRecipients).set({ isDefault: false }).where(eq(sampleRecipients.customerId, input.customerId));
      const { version, ...data } = input;
      if (!id) {
        const created = (await tx.insert(sampleRecipients).values({ ...data, createdBy: ctx.userId }).returning())[0]!;
        await this.audit.log(ctx, { action: "sampleship.recipient.create", objectType: "sampleRecipient", objectId: created.id }, tx);
        return created;
      }
      const before = assertFound((await tx.select().from(sampleRecipients).where(eq(sampleRecipients.id, id)))[0]);
      if (version !== undefined && version !== before.version) throw versionConflict();
      const updated = (await tx.update(sampleRecipients).set({ ...data, version: before.version + 1, updatedBy: ctx.userId }).where(eq(sampleRecipients.id, id)).returning())[0]!;
      await this.audit.log(ctx, { action: "sampleship.recipient.update", objectType: "sampleRecipient", objectId: id }, tx);
      return updated;
    });
    return (await this.toRecipients([row]))[0]!;
  }

  async list(ctx: AccessContext, q: z.infer<typeof sampleShipmentListQuerySchema>): Promise<Page<SampleShipmentDto>> {
    const conds: SQL[] = [scoped(sampleShipments, ctx)];
    if (q.status?.length) conds.push(inArray(sampleShipments.status, q.status));
    if (q.customerId) conds.push(eq(sampleShipments.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(sampleShipments.docNo, kw), ilike(sampleShipments.trackingNo, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(sampleShipments).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(sampleShipments).where(where).orderBy(desc(sampleShipments.createdAt)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<SampleShipmentDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(sampleShipments).where(eq(sampleShipments.id, id)))[0]);
    return (await this.toDtos([row]))[0]!;
  }

  async create(ctx: AccessContext, input: z.infer<typeof sampleShipmentCreateSchema>): Promise<SampleShipmentDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      if (input.recipientId) {
        const r = assertFound((await tx.select().from(sampleRecipients).where(eq(sampleRecipients.id, input.recipientId)))[0]);
        if (r.customerId !== input.customerId) throw new AppError(sampleshipErrors.SAMPLESHIP_RECIPIENT_CUSTOMER_MISMATCH);
      }
      await this.assertStylesVisible(ctx, tx, input.customerId, input.items.map((i) => i.styleId));
      const docNo = await this.numbering.next("sampleShipment", tx);
      const created = (
        await tx
          .insert(sampleShipments)
          .values({ docNo, recipientId: input.recipientId ?? null, method: input.method, courier: input.courier ?? null, status: "DRAFT", items: input.items.map(({ styleNo: _s, ...i }) => i), note: input.note ?? null, ...ownership(ctx, input.customerId), createdBy: ctx.userId })
          .returning()
      )[0]!;
      await this.audit.log(ctx, { action: "sampleship.shipment.create", objectType: "sampleShipment", objectId: created.id, docNo }, tx);
      emit({ type: "sampleship.shipment.created", aggregateType: "sampleShipment", aggregateId: created.id, payload: { docNo } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async send(ctx: AccessContext, id: string, input: { trackingNo: string; courier?: string; version: number }): Promise<SampleShipmentDto> {
    return this.transition(ctx, id, "SENT", "send", input.version, { trackingNo: input.trackingNo, ...(input.courier ? { courier: input.courier } : {}), sentAt: this.clock.now() });
  }

  async sign(ctx: AccessContext, id: string, input: { signedAt?: string; version: number }): Promise<SampleShipmentDto> {
    return this.transition(ctx, id, "SIGNED", "sign", input.version, { signedAt: input.signedAt ? new Date(input.signedAt) : this.clock.now() });
  }

  private async transition(ctx: AccessContext, id: string, to: "SENT" | "SIGNED", action: string, version: number, patch: Partial<ShipmentRow>): Promise<SampleShipmentDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(sampleShipments).where(eq(sampleShipments.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("sampleShipment", before.status as "DRAFT", to)) throw illegalTransition(before.status, action);
      const updated = (await tx.update(sampleShipments).set({ ...patch, status: to, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(sampleShipments.id, id), eq(sampleShipments.version, version))).returning())[0];
      if (!updated) throw versionConflict();
      await this.audit.log(ctx, { action: `sampleship.shipment.${action}`, objectType: "sampleShipment", objectId: id, docNo: before.docNo, diff: { status: { from: before.status, to } } }, tx);
      emit({ type: `sampleship.shipment.${to === "SENT" ? "sent" : "signed"}`, aggregateType: "sampleShipment", aggregateId: id, payload: { docNo: before.docNo, items: before.items } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private async assertStylesVisible(ctx: AccessContext, tx: DbOrTx, customerId: string, styleIds: string[]): Promise<void> {
    const rows = await tx.select().from(styles).where(inArray(styles.id, styleIds));
    for (const id of styleIds) {
      const s = assertCanSee(ctx, rows.find((r) => r.id === id));
      if (s.customerId !== customerId) throw new AppError(sampleshipErrors.SAMPLESHIP_RECIPIENT_CUSTOMER_MISMATCH);
    }
  }

  private async toRecipients(rows: RecipientRow[]): Promise<RecipientDto[]> {
    if (!rows.length) return [];
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const names = new Map(custs.map((c) => [c.id, c.name]));
    return rows.map((r) => ({ id: r.id, customerId: r.customerId, customerName: names.get(r.customerId) ?? "", company: r.company, name: r.name, address: r.address, phone: r.phone, email: r.email, courier: r.courier, isDefault: r.isDefault, version: r.version }));
  }

  private async toDtos(rows: ShipmentRow[]): Promise<SampleShipmentDto[]> {
    if (!rows.length) return [];
    const recipientIds = rows.map((r) => r.recipientId).filter((x): x is string => !!x);
    const recipients = recipientIds.length ? await this.toRecipients(await this.db.select().from(sampleRecipients).where(inArray(sampleRecipients.id, recipientIds))) : [];
    const custs = await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, [...new Set(rows.map((r) => r.customerId))]));
    const owners = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))]));
    const styleIds = [...new Set(rows.flatMap((r) => r.items.map((i) => i.styleId)))];
    const styleRows = styleIds.length ? await this.db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)) : [];
    const styleNo = new Map(styleRows.map((s) => [s.id, s.styleNo]));
    return rows.map((r) => ({
      id: r.id,
      docNo: r.docNo,
      customerId: r.customerId,
      customerName: custs.find((c) => c.id === r.customerId)?.name ?? "",
      recipient: recipients.find((x) => x.id === r.recipientId) ?? null,
      method: r.method as SampleShipmentDto["method"],
      courier: r.courier,
      trackingNo: r.trackingNo,
      sentAt: iso(r.sentAt),
      signedAt: iso(r.signedAt),
      status: r.status as SampleShipmentDto["status"],
      items: r.items.map((i) => ({ ...i, styleNo: styleNo.get(i.styleId) ?? "" })),
      note: r.note,
      ownerId: r.ownerId,
      ownerName: owners.find((o) => o.id === r.ownerId)?.name ?? "",
      createdAt: r.createdAt.toISOString(),
      version: r.version,
    }));
  }
}
