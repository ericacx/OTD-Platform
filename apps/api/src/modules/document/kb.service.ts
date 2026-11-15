import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import type { KbDocumentDto, KbKind, kbDocumentUpsertSchema, kbListQuerySchema } from "@otd/contracts/document";
import { type Database, customers, files, kbDocuments, users } from "@otd/db";
import { type SQL, and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer, hasPermission } from "../../core/access/access.types.js";
import { customerScoped, requirePermission } from "../../core/access/scope.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { assertFound, forbidden, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { countAll, likeKeyword, paginate } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type KbRow = typeof kbDocuments.$inferSelect;

const PERM: Record<KbKind, { view: string; edit: string }> = {
  MANUAL: { view: "document.manual.view", edit: "document.manual.edit" },
  KB: { view: "document.kb.view", edit: "document.kb.edit" },
};

@Injectable()
export class KbService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  async list(ctx: AccessContext, q: z.infer<typeof kbListQuerySchema>): Promise<Page<KbDocumentDto>> {
    const kinds = (q.kind ? [q.kind] : (Object.keys(PERM) as KbKind[])).filter((k) => hasPermission(ctx, PERM[k].view));
    if (!kinds.length) throw forbidden(PERM[q.kind ?? "KB"].view);
    const conds: SQL[] = [inArray(kbDocuments.kind, kinds), or(isNull(kbDocuments.customerId), customerScoped(kbDocuments.customerId, ctx))!];
    if (q.customerId) conds.push(eq(kbDocuments.customerId, q.customerId));
    if (q.tag) conds.push(sql`${kbDocuments.tags} @> ${JSON.stringify([q.tag])}::jsonb`);
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(kbDocuments.title, kw), ilike(kbDocuments.content, kw))!);
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(kbDocuments).where(where))[0]!.n,
      async (limit, offset) => this.toDtos(await this.db.select().from(kbDocuments).where(where).orderBy(desc(kbDocuments.updatedAt)).limit(limit).offset(offset)),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<KbDocumentDto> {
    return (await this.toDtos([this.visible(ctx, (await this.db.select().from(kbDocuments).where(eq(kbDocuments.id, id)))[0])]))[0]!;
  }

  async create(ctx: AccessContext, input: z.infer<typeof kbDocumentUpsertSchema>): Promise<KbDocumentDto> {
    requirePermission(ctx, PERM[input.kind].edit);
    if (input.customerId && !canSeeCustomer(ctx, input.customerId)) throw notFound();
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      if (input.customerId) assertFound((await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)))[0]);
      if (input.fileId) assertFound((await tx.select({ id: files.id }).from(files).where(eq(files.id, input.fileId)))[0]);
      const created = (
        await tx
          .insert(kbDocuments)
          .values({ kind: input.kind, title: input.title, customerId: input.customerId ?? null, tags: [...new Set(input.tags)], content: input.content, fileId: input.fileId ?? null, createdBy: ctx.userId, updatedBy: ctx.userId })
          .returning()
      )[0]!;
      if (input.fileId) await tx.update(files).set({ ownerType: "kbDocument", ownerId: created.id }).where(eq(files.id, input.fileId));
      await this.audit.log(ctx, { action: "document.kb.create", objectType: "kbDocument", objectId: created.id, docNo: created.title }, tx);
      emit({ type: "document.kb.created", aggregateType: "kbDocument", aggregateId: created.id, payload: { kind: created.kind } });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof kbDocumentUpsertSchema>): Promise<KbDocumentDto> {
    requirePermission(ctx, PERM[input.kind].edit);
    if (input.customerId && !canSeeCustomer(ctx, input.customerId)) throw notFound();
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = this.visible(ctx, (await tx.select().from(kbDocuments).where(eq(kbDocuments.id, id)))[0]);
      requirePermission(ctx, PERM[before.kind as KbKind].edit);
      if (input.version !== before.version) throw versionConflict();
      if (input.fileId && input.fileId !== before.fileId) assertFound((await tx.select({ id: files.id }).from(files).where(eq(files.id, input.fileId)))[0]);
      const patch = { kind: input.kind, title: input.title, customerId: input.customerId ?? null, tags: [...new Set(input.tags)], content: input.content, fileId: input.fileId ?? null };
      const updated = (await tx.update(kbDocuments).set({ ...patch, version: before.version + 1, updatedBy: ctx.userId }).where(and(eq(kbDocuments.id, id), eq(kbDocuments.version, before.version))).returning())[0];
      if (!updated) throw versionConflict();
      if (input.fileId && input.fileId !== before.fileId) await tx.update(files).set({ ownerType: "kbDocument", ownerId: id }).where(eq(files.id, input.fileId));
      const diff = diffOf(before as unknown as Record<string, unknown>, patch);
      if (diff.content) diff.content = { from: before.content.length, to: input.content.length };
      await this.audit.log(ctx, { action: "document.kb.update", objectType: "kbDocument", objectId: id, docNo: updated.title, diff }, tx);
      emit({ type: "document.kb.updated", aggregateType: "kbDocument", aggregateId: id, payload: { kind: updated.kind } });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private visible(ctx: AccessContext, row: KbRow | undefined): KbRow {
    if (!row) throw notFound();
    requirePermission(ctx, PERM[row.kind as KbKind].view);
    if (row.customerId && !canSeeCustomer(ctx, row.customerId)) throw notFound();
    return row;
  }

  private async toDtos(rows: KbRow[]): Promise<KbDocumentDto[]> {
    if (!rows.length) return [];
    const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const custRows = custIds.length ? await this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)) : [];
    const userIds = [...new Set(rows.map((r) => r.updatedBy ?? r.createdBy).filter((x): x is string => !!x))];
    const userRows = userIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [];
    const fileIds = [...new Set(rows.map((r) => r.fileId).filter((x): x is string => !!x))];
    const fileRows = fileIds.length ? await this.db.select().from(files).where(inArray(files.id, fileIds)) : [];
    return rows.map((r) => {
      const file = r.fileId ? fileRows.find((f) => f.id === r.fileId) : undefined;
      const editor = r.updatedBy ?? r.createdBy;
      return {
        id: r.id,
        kind: r.kind as KbKind,
        title: r.title,
        customerId: r.customerId,
        customerName: r.customerId ? (custRows.find((c) => c.id === r.customerId)?.name ?? null) : null,
        tags: r.tags,
        content: r.content,
        excerpt: r.content.replace(/\s+/g, " ").trim().slice(0, 120),
        file: file ? { id: file.id, filename: file.filename, contentType: file.contentType, size: file.size } : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        updatedByName: editor ? (userRows.find((u) => u.id === editor)?.name ?? null) : null,
        version: r.version,
      };
    });
  }
}
