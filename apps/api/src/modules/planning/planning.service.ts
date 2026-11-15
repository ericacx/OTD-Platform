import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  LOW_CONFIDENCE,
  PLANNING_EXTRACT_INSTRUCTIONS,
  PLANNING_FIELDS,
  PRODUCT_ATTRS,
  type PlanningDto,
  type PlanningExtraction,
  type PlanningField,
  type PlanningStatus,
  type ProductAttrKey,
  type planningConfirmSchema,
  type planningCreateSchema,
  type planningFieldsSchema,
  type planningListQuerySchema,
  type planningUpdateSchema,
  planningErrors,
  planningExtractionSchema,
} from "@otd/contracts/planning";
import {
  type Database,
  type DbOrTx,
  type ExtractedField,
  customers,
  orderLines,
  plannings,
  samples,
  styles,
  users,
} from "@otd/db";
import { canTransition, isSeasonCode } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { type AccessContext, canSeeCustomer } from "../../core/access/access.types.js";
import { assertCanSee, ownership, scoped } from "../../core/access/scope.js";
import type { AiDocument, AiProvider } from "../../core/ai/ai.types.js";
import { AuditService, diffOf } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, illegalTransition, notFound, versionConflict } from "../../core/errors.js";
import { EventBus, inTransaction } from "../../core/events.js";
import { FileService } from "../../core/files/file.service.js";
import { NumberingService } from "../../core/numbering.service.js";
import { countAll, iso, likeKeyword, paginate } from "../../core/paging.js";
import { AI_PROVIDER, DB } from "../../core/tokens.js";
import { SampleService } from "../sample/sample.service.js";

type PlanningRow = typeof plannings.$inferSelect;
type FieldInput = z.infer<typeof planningFieldsSchema>;
type ColumnField = Exclude<PlanningField, "customerName">;

const COLUMN_FIELDS = PLANNING_FIELDS.filter((f): f is ColumnField => f !== "customerName");
const ACCEPTED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);
const CATEGORIES = new Set(["KIDS", "WOMEN", "MEN"]);
const SUB_CATEGORIES = new Set(["CREW", "NO_SHOW", "ANKLE", "QUARTER", "HALF_CALF"]);
const REQUIRED_TO_CONFIRM: [ColumnField, string][] = [
  ["styleNo", "款号"],
  ["nameZh", "中文名称"],
  ["seasonCode", "季节"],
];
const EDITABLE: PlanningStatus[] = ["EXTRACTED", "CONFIRMED"];

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 0;
}

function normalize(field: ColumnField, value: string | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (field === "styleNo") return v.replace(/^#/, "");
  if (field === "seasonCode") return isSeasonCode(v.toUpperCase()) ? v.toUpperCase() : null;
  if (field === "category") return CATEGORIES.has(v.toUpperCase()) ? v.toUpperCase() : null;
  if (field === "subCategory") return SUB_CATEGORIES.has(v.toUpperCase()) ? v.toUpperCase() : null;
  if (field === "requiredSampleDate") return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  return v;
}

@Injectable()
export class PlanningService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly files: FileService,
    private readonly samples: SampleService,
  ) {}

  async list(
    ctx: AccessContext,
    q: z.infer<typeof planningListQuerySchema>,
    archived: boolean,
  ): Promise<Page<PlanningDto>> {
    const conds: SQL[] = [
      scoped(plannings, ctx),
      archived ? eq(plannings.status, "ARCHIVED") : ne(plannings.status, "ARCHIVED"),
    ];
    if (q.status?.length) conds.push(inArray(plannings.status, q.status));
    if (q.seasonCode) conds.push(eq(plannings.seasonCode, q.seasonCode));
    if (q.category) conds.push(eq(plannings.category, q.category));
    if (q.customerId) conds.push(eq(plannings.customerId, q.customerId));
    const kw = likeKeyword(q.keyword);
    if (kw) {
      const custIds = this.db
        .select({ id: customers.id })
        .from(customers)
        .where(or(ilike(customers.name, kw), ilike(customers.nameEn, kw), ilike(customers.code, kw)));
      conds.push(
        or(
          ilike(plannings.docNo, kw),
          ilike(plannings.styleNo, kw),
          ilike(plannings.nameZh, kw),
          ilike(plannings.nameEn, kw),
          inArray(plannings.customerId, custIds),
        )!,
      );
    }
    const where = and(...conds);
    return paginate(
      q,
      async () => (await this.db.select({ n: countAll }).from(plannings).where(where))[0]!.n,
      async (limit, offset) =>
        this.toDtos(
          await this.db
            .select()
            .from(plannings)
            .where(where)
            .orderBy(desc(plannings.createdAt), desc(plannings.docNo))
            .limit(limit)
            .offset(offset),
        ),
    );
  }

  async get(ctx: AccessContext, id: string): Promise<PlanningDto> {
    const row = assertCanSee(ctx, (await this.db.select().from(plannings).where(eq(plannings.id, id)))[0]);
    return (await this.toDtos([row]))[0]!;
  }

  async importFile(
    ctx: AccessContext,
    input: FieldInput & { customerId: string },
    file: AiDocument,
  ): Promise<PlanningDto> {
    if (!ACCEPTED_TYPES.has(file.contentType)) throw new AppError(planningErrors.PLANNING_FILE_UNSUPPORTED);
    await this.assertCustomer(ctx, input.customerId);
    const created = await inTransaction(this.db, this.events, async (tx, emit) => {
      const stored = await this.files.save(
        ctx,
        { filename: file.filename, contentType: file.contentType, data: file.data, ownerType: "planning" },
        tx,
      );
      const row = await this.insertPlanning(ctx, tx, input, "RECOGNIZING", {
        sourceFileId: stored.id,
        sourceFilename: stored.filename,
      });
      await this.files.attach(stored.id, "planning", row.id, tx);
      emit({
        type: "planning.planning.imported",
        aggregateType: "planning",
        aggregateId: row.id,
        payload: { docNo: row.docNo },
      });
      return row;
    });
    return this.runRecognition(ctx, created.id, async () => file);
  }

  async create(ctx: AccessContext, input: z.infer<typeof planningCreateSchema>): Promise<PlanningDto> {
    const { fileId, ...fields } = input;
    await this.assertCustomer(ctx, fields.customerId);
    if (fileId) {
      const meta = await this.files.meta(fileId);
      if (!meta) throw notFound();
      if (!ACCEPTED_TYPES.has(meta.contentType)) throw new AppError(planningErrors.PLANNING_FILE_UNSUPPORTED);
      const doc = await this.files.read(fileId);
      const created = await inTransaction(this.db, this.events, async (tx, emit) => {
        const row = await this.insertPlanning(ctx, tx, fields, "RECOGNIZING", {
          sourceFileId: fileId,
          sourceFilename: meta.filename,
        });
        await this.files.attach(fileId, "planning", row.id, tx);
        emit({
          type: "planning.planning.imported",
          aggregateType: "planning",
          aggregateId: row.id,
          payload: { docNo: row.docNo },
        });
        return row;
      });
      return this.runRecognition(ctx, created.id, async () => doc);
    }
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const created = await this.insertPlanning(ctx, tx, fields, "EXTRACTED", {});
      emit({
        type: "planning.planning.created",
        aggregateType: "planning",
        aggregateId: created.id,
        payload: { docNo: created.docNo },
      });
      return created;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async retryRecognition(ctx: AccessContext, id: string, version: number): Promise<PlanningDto> {
    const row = await inTransaction(this.db, this.events, async (tx) => {
      const before = assertCanSee(ctx, (await tx.select().from(plannings).where(eq(plannings.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      const rerun = before.status === "RECOGNIZING";
      if (!rerun && !canTransition("planning", before.status as PlanningStatus, "RECOGNIZING"))
        throw illegalTransition(before.status, "recognize");
      if (!before.sourceFileId) throw new AppError(planningErrors.PLANNING_NO_SOURCE);
      const updated = await this.updateVersioned(tx, before, {
        status: "RECOGNIZING",
        recognitionError: null,
        updatedBy: ctx.userId,
      });
      await this.audit.log(
        ctx,
        {
          action: "planning.planning.retry",
          objectType: "planning",
          objectId: id,
          docNo: before.docNo,
          diff: { status: { from: before.status, to: "RECOGNIZING" } },
        },
        tx,
      );
      return updated;
    });
    const fileId = row.sourceFileId!;
    return this.runRecognition(ctx, id, () => this.files.read(fileId));
  }

  async manualEntry(ctx: AccessContext, id: string, version: number): Promise<PlanningDto> {
    return this.transition(ctx, id, version, "EXTRACTED", "manual", {});
  }

  async update(ctx: AccessContext, id: string, input: z.infer<typeof planningUpdateSchema>): Promise<PlanningDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(plannings).where(eq(plannings.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!EDITABLE.includes(before.status as PlanningStatus))
        throw new AppError(planningErrors.PLANNING_NOT_EDITABLE, { status: before.status });
      const { version: _v, productAttrs, ...fields } = input;
      const patch: Partial<PlanningRow> = {};
      const extraction: Record<string, ExtractedField> = { ...(before.extraction ?? {}) };
      let reviewed = false;
      for (const key of COLUMN_FIELDS) {
        const value = fields[key];
        if (value === undefined) continue;
        const next =
          value === null || value === "" ? null : key === "seasonCode" && value ? value.toUpperCase() : value;
        if (next === before[key]) {
          const cur = extraction[key];
          if (cur && cur.confidence < 1 && next !== null) {
            extraction[key] = { ...cur, value: next, confidence: 1, source: "人工确认" };
            reviewed = true;
          }
          continue;
        }
        (patch as Record<string, unknown>)[key] = next;
        extraction[key] = { value: next, confidence: 1, source: "人工修改" };
      }
      if (fields.briefTranslation !== undefined && fields.briefTranslation !== before.briefTranslation)
        patch.briefTranslation = fields.briefTranslation;
      if (productAttrs) {
        const attrs = { ...before.productAttrs };
        for (const [key, v] of Object.entries(productAttrs)) {
          if (!v) continue;
          const cur = attrs[key] ?? {};
          const merged = {
            ...cur,
            ...(v.original !== undefined ? { en: v.original ?? undefined } : {}),
            ...(v.translated !== undefined ? { zh: v.translated ?? undefined } : {}),
          };
          attrs[key] = merged;
          extraction[`attr.${key}`] = { value: merged.en ?? merged.zh ?? null, confidence: 1, source: "人工修改" };
        }
        patch.productAttrs = attrs;
      }
      if (before.status === "CONFIRMED" && patch.styleNo !== undefined)
        throw new AppError(planningErrors.PLANNING_NOT_EDITABLE, { status: before.status });
      const auditPatch = { ...patch };
      if (!Object.keys(patch).length && !reviewed) return before;
      if (before.extraction || Object.keys(extraction).length) patch.extraction = extraction;
      const updated = await this.updateVersioned(tx, before, { ...patch, updatedBy: ctx.userId });
      await this.audit.log(
        ctx,
        {
          action: before.status === "CONFIRMED" ? "planning.planning.updateConfirmed" : "planning.planning.update",
          objectType: "planning",
          objectId: id,
          docNo: before.docNo,
          diff: diffOf(before as Record<string, unknown>, auditPatch as Record<string, unknown>),
        },
        tx,
      );
      if (before.status === "CONFIRMED" && before.styleId) await this.syncStyle(tx, before.styleId, updated);
      emit({
        type: "planning.planning.updated",
        aggregateType: "planning",
        aggregateId: id,
        payload: { docNo: before.docNo, status: before.status, styleId: before.styleId },
      });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async confirm(ctx: AccessContext, id: string, input: z.infer<typeof planningConfirmSchema>): Promise<PlanningDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(plannings).where(eq(plannings.id, id)))[0]);
      if (before.version !== input.version) throw versionConflict();
      if (!canTransition("planning", before.status as PlanningStatus, "CONFIRMED"))
        throw illegalTransition(before.status, "confirm");
      const missing = REQUIRED_TO_CONFIRM.filter(([k]) => !before[k]).map(([, label]) => label);
      if (missing.length)
        throw new AppError(planningErrors.PLANNING_CONFIRM_INCOMPLETE, { fields: missing.join("、"), missing });
      const style = await this.findOrCreateStyle(ctx, tx, before);
      const now = this.clock.now();
      const updated = await this.updateVersioned(tx, before, {
        status: "CONFIRMED",
        styleId: style.id,
        confirmedAt: now,
        confirmedBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      const sample = await this.samples.issueFromPlanning(ctx, tx, emit, {
        style,
        planningId: before.id,
        roundType: input.roundType ?? "PROTO",
        quantity: input.quantity ?? 6,
        factoryId: input.factoryId ?? null,
        dueDate: before.requiredSampleDate,
        briefTranslation: before.briefTranslation,
        sizeRange: before.sizeRange,
      });
      await this.audit.log(
        ctx,
        {
          action: "planning.planning.confirm",
          objectType: "planning",
          objectId: id,
          docNo: before.docNo,
          diff: { status: { from: before.status, to: "CONFIRMED" }, styleNo: style.styleNo, sampleDocNo: sample.docNo },
        },
        tx,
      );
      emit({
        type: "planning.planning.confirmed",
        aggregateType: "planning",
        aggregateId: id,
        payload: { docNo: before.docNo, styleId: style.id, sampleId: sample.id },
      });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  async archive(ctx: AccessContext, id: string, version: number): Promise<PlanningDto> {
    return this.transition(
      ctx,
      id,
      version,
      "ARCHIVED",
      "archive",
      { archivedAt: this.clock.now() },
      async (tx, before) => {
        if (!before.styleId) return;
        const used = await tx
          .select({ id: orderLines.id })
          .from(orderLines)
          .where(eq(orderLines.styleId, before.styleId))
          .limit(1);
        if (used.length) throw new AppError(planningErrors.PLANNING_STYLE_HAS_ORDERS, { styleNo: before.styleNo });
      },
    );
  }

  private async transition(
    ctx: AccessContext,
    id: string,
    version: number,
    to: PlanningStatus,
    action: string,
    patch: Partial<PlanningRow>,
    guard?: (tx: DbOrTx, before: PlanningRow) => Promise<void>,
  ): Promise<PlanningDto> {
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertCanSee(ctx, (await tx.select().from(plannings).where(eq(plannings.id, id)))[0]);
      if (before.version !== version) throw versionConflict();
      if (!canTransition("planning", before.status as PlanningStatus, to))
        throw illegalTransition(before.status, action);
      if (guard) await guard(tx, before);
      const updated = await this.updateVersioned(tx, before, { ...patch, status: to, updatedBy: ctx.userId });
      await this.audit.log(
        ctx,
        {
          action: `planning.planning.${action}`,
          objectType: "planning",
          objectId: id,
          docNo: before.docNo,
          diff: { status: { from: before.status, to } },
        },
        tx,
      );
      emit({
        type: `planning.planning.${action === "archive" ? "archived" : action}`,
        aggregateType: "planning",
        aggregateId: id,
        payload: { docNo: before.docNo, styleId: before.styleId },
      });
      return updated;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private async runRecognition(ctx: AccessContext, id: string, load: () => Promise<AiDocument>): Promise<PlanningDto> {
    let result: PlanningExtraction | null = null;
    let error: string | null = null;
    let doc: AiDocument | null = null;
    try {
      doc = await load();
    } catch (err) {
      error = `原件读取失败：${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    }
    if (doc) {
      try {
        result = await this.ai.extract({
          purpose: "planning.extract",
          instructions: PLANNING_EXTRACT_INSTRUCTIONS,
          document: doc,
          text: `原件文件名：${doc.filename}\n请抽取这份企划原件的要素。`,
          schema: planningExtractionSchema,
          userId: ctx.userId,
        });
      } catch (err) {
        error = (err instanceof Error ? err.message : String(err)).slice(0, 500) || "识别失败";
      }
    }
    const row = await inTransaction(this.db, this.events, async (tx, emit) => {
      const before = assertFound((await tx.select().from(plannings).where(eq(plannings.id, id)))[0]);
      if (before.status !== "RECOGNIZING") return before;
      const now = this.clock.now();
      if (!result) {
        const failed = await this.updateVersioned(tx, before, {
          status: "RECOGNITION_FAILED",
          recognitionError: error,
          recognizedAt: now,
        });
        await this.audit.log(
          ctx,
          {
            action: "planning.planning.recognitionFailed",
            objectType: "planning",
            objectId: id,
            docNo: before.docNo,
            diff: { status: { from: "RECOGNIZING", to: "RECOGNITION_FAILED" }, error },
          },
          tx,
        );
        emit({
          type: "planning.planning.recognitionFailed",
          aggregateType: "planning",
          aggregateId: id,
          payload: { docNo: before.docNo, error, styleId: before.styleId },
        });
        return failed;
      }
      const merged = this.merge(before, result);
      const extracted = await this.updateVersioned(tx, before, {
        ...merged,
        status: "EXTRACTED",
        recognitionError: null,
        recognizedAt: now,
      });
      await this.audit.log(
        ctx,
        {
          action: "planning.planning.extracted",
          objectType: "planning",
          objectId: id,
          docNo: before.docNo,
          diff: { status: { from: "RECOGNIZING", to: "EXTRACTED" } },
        },
        tx,
      );
      emit({
        type: "planning.planning.extracted",
        aggregateType: "planning",
        aggregateId: id,
        payload: { docNo: before.docNo, styleId: before.styleId },
      });
      return extracted;
    });
    return (await this.toDtos([row]))[0]!;
  }

  private merge(before: PlanningRow, result: PlanningExtraction): Partial<PlanningRow> {
    const patch: Partial<PlanningRow> = {};
    const extraction: Record<string, ExtractedField> = {};
    for (const key of PLANNING_FIELDS) {
      const ai = result.fields[key];
      const source = ai.source ?? undefined;
      const page = ai.page ?? undefined;
      if (key === "customerName") {
        extraction[key] = {
          value: ai.value,
          confidence: clamp(ai.confidence),
          ...(source ? { source } : {}),
          ...(page ? { page } : {}),
        };
        continue;
      }
      const prefilled = before[key];
      if (prefilled) {
        extraction[key] = { value: prefilled, confidence: 1, source: "人工预填" };
        continue;
      }
      const value = normalize(key, ai.value);
      (patch as Record<string, unknown>)[key] = value;
      extraction[key] = {
        value,
        confidence: value === null ? 0 : clamp(ai.confidence),
        ...(source ? { source } : {}),
        ...(page ? { page } : {}),
      };
    }
    const attrs: PlanningRow["productAttrs"] = {};
    for (const a of result.productAttrs) {
      attrs[a.key] = { ...(a.original ? { en: a.original } : {}), ...(a.translated ? { zh: a.translated } : {}) };
      extraction[`attr.${a.key}`] = {
        value: a.original,
        confidence: a.original ? clamp(a.confidence) : 0,
        ...(a.page ? { page: a.page } : {}),
      };
    }
    patch.productAttrs = attrs;
    patch.extraction = extraction;
    if (!before.briefTranslation && result.briefTranslation) patch.briefTranslation = result.briefTranslation;
    return patch;
  }

  private async insertPlanning(
    ctx: AccessContext,
    tx: DbOrTx,
    input: FieldInput & { customerId: string },
    status: PlanningStatus,
    source: { sourceFileId?: string; sourceFilename?: string },
  ): Promise<PlanningRow> {
    const docNo = await this.numbering.next("planning", tx);
    const now = this.clock.now();
    const values: Partial<PlanningRow> = {};
    for (const key of COLUMN_FIELDS) {
      const v = input[key];
      (values as Record<string, unknown>)[key] =
        v === undefined || v === "" ? null : key === "seasonCode" && v ? v.toUpperCase() : v;
    }
    const created = (
      await tx
        .insert(plannings)
        .values({
          ...values,
          briefTranslation: input.briefTranslation ?? null,
          docNo,
          status,
          sourceFileId: source.sourceFileId ?? null,
          sourceFilename: source.sourceFilename ?? null,
          ...ownership(ctx, input.customerId),
          createdBy: ctx.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0]!;
    await this.audit.log(
      ctx,
      {
        action: status === "RECOGNIZING" ? "planning.planning.import" : "planning.planning.create",
        objectType: "planning",
        objectId: created.id,
        docNo,
      },
      tx,
    );
    return created;
  }

  private async updateVersioned(tx: DbOrTx, before: PlanningRow, patch: Partial<PlanningRow>): Promise<PlanningRow> {
    const updated = (
      await tx
        .update(plannings)
        .set({ ...patch, version: before.version + 1, updatedAt: this.clock.now() })
        .where(and(eq(plannings.id, before.id), eq(plannings.version, before.version)))
        .returning()
    )[0];
    if (!updated) throw versionConflict();
    return updated;
  }

  private async assertCustomer(ctx: AccessContext, customerId: string): Promise<void> {
    const c = (await this.db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)))[0];
    if (!c || !canSeeCustomer(ctx, customerId)) throw notFound();
  }

  private async findOrCreateStyle(ctx: AccessContext, tx: DbOrTx, p: PlanningRow) {
    const existing = (
      await tx
        .select()
        .from(styles)
        .where(and(eq(styles.customerId, p.customerId), eq(styles.styleNo, p.styleNo!)))
    )[0];
    if (existing) {
      const fill: Partial<typeof styles.$inferInsert> = {};
      if (!existing.nameEn && p.nameEn) fill.nameEn = p.nameEn;
      if (!existing.category && p.category) fill.category = p.category;
      if (!existing.subCategory && p.subCategory) fill.subCategory = p.subCategory;
      if (!existing.seasonCode && p.seasonCode) fill.seasonCode = p.seasonCode;
      if (!Object.keys(fill).length) return existing;
      return (
        await tx
          .update(styles)
          .set({ ...fill, version: existing.version + 1, updatedBy: ctx.userId, updatedAt: this.clock.now() })
          .where(eq(styles.id, existing.id))
          .returning()
      )[0]!;
    }
    const customer = assertFound(
      (await tx.select({ code: customers.code }).from(customers).where(eq(customers.id, p.customerId)))[0],
    );
    const now = this.clock.now();
    return (
      await tx
        .insert(styles)
        .values({
          styleNo: p.styleNo!,
          nameZh: p.nameZh!,
          nameEn: p.nameEn,
          category: p.category,
          subCategory: p.subCategory,
          seasonCode: p.seasonCode,
          productCode: `${customer.code}${p.styleNo}-${p.seasonCode}`,
          imageFileId: p.imageFileIds[0] ?? null,
          ownerId: p.ownerId,
          orgId: p.orgId,
          customerId: p.customerId,
          createdBy: ctx.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    )[0]!;
  }

  private async syncStyle(tx: DbOrTx, styleId: string, p: PlanningRow): Promise<void> {
    const style = (await tx.select().from(styles).where(eq(styles.id, styleId)))[0];
    if (!style) return;
    const patch: Partial<typeof styles.$inferInsert> = {};
    if (p.nameZh && p.nameZh !== style.nameZh) patch.nameZh = p.nameZh;
    if (p.nameEn !== style.nameEn) patch.nameEn = p.nameEn;
    if (p.category !== style.category) patch.category = p.category;
    if (p.subCategory !== style.subCategory) patch.subCategory = p.subCategory;
    if (p.seasonCode && p.seasonCode !== style.seasonCode) patch.seasonCode = p.seasonCode;
    if (!Object.keys(patch).length) return;
    await tx
      .update(styles)
      .set({ ...patch, version: style.version + 1, updatedAt: this.clock.now() })
      .where(eq(styles.id, styleId));
  }

  private async toDtos(rows: PlanningRow[]): Promise<PlanningDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const custIds = [...new Set(rows.map((r) => r.customerId))];
    const userIds = [...new Set(rows.flatMap((r) => [r.ownerId, r.confirmedBy]).filter((x): x is string => !!x))];
    const [custRows, userRows, sampleRows] = await Promise.all([
      this.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)),
      userIds.length
        ? this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
        : [],
      this.db
        .select({ id: samples.id, docNo: samples.docNo, planningId: samples.planningId })
        .from(samples)
        .where(inArray(samples.planningId, ids))
        .orderBy(asc(samples.createdAt)),
    ]);
    const cust = new Map(custRows.map((c) => [c.id, c.name]));
    const user = new Map(userRows.map((u) => [u.id, u.name]));
    return rows.map((r) => {
      const extraction = r.extraction ?? null;
      const productAttrs = PRODUCT_ATTRS.map((a) => {
        const v = r.productAttrs[a.key] ?? {};
        return {
          key: a.key as ProductAttrKey,
          labelZh: a.zh,
          labelEn: a.en,
          original: v.en ?? v.value ?? null,
          translated: v.zh ?? null,
          confidence: extraction?.[`attr.${a.key}`]?.confidence ?? null,
        };
      });
      const low = extraction
        ? Object.entries(extraction)
            .filter(([, f]) => f.value !== null && f.value !== "" && f.confidence < LOW_CONFIDENCE)
            .map(([k]) => k)
        : [];
      const sample = sampleRows.find((s) => s.planningId === r.id);
      return {
        id: r.id,
        docNo: r.docNo,
        status: r.status as PlanningStatus,
        styleId: r.styleId,
        styleNo: r.styleNo,
        seasonCode: r.seasonCode,
        customerId: r.customerId,
        customerName: cust.get(r.customerId) ?? "",
        nameZh: r.nameZh,
        nameEn: r.nameEn,
        category: r.category,
        subCategory: r.subCategory,
        defaultSize: r.defaultSize,
        sizeRange: r.sizeRange,
        supplier: r.supplier,
        buyerName: r.buyerName,
        designer: r.designer,
        needleCount: r.needleCount,
        sockWeight: r.sockWeight,
        requiredSampleDate: r.requiredSampleDate,
        briefTranslation: r.briefTranslation,
        productAttrs,
        extraction: extraction
          ? Object.fromEntries(
              Object.entries(extraction).map(([k, f]) => [
                k,
                { value: f.value, confidence: f.confidence, source: f.source ?? null, page: f.page ?? null },
              ]),
            )
          : null,
        lowConfidenceFields: low,
        sourceFile: r.sourceFileId ? { id: r.sourceFileId, filename: r.sourceFilename ?? "" } : null,
        imageFileIds: r.imageFileIds,
        recognitionError: r.recognitionError,
        recognizedAt: iso(r.recognizedAt),
        confirmedAt: iso(r.confirmedAt),
        confirmedByName: r.confirmedBy ? (user.get(r.confirmedBy) ?? null) : null,
        archivedAt: iso(r.archivedAt),
        sample: sample ? { id: sample.id, docNo: sample.docNo } : null,
        ownerId: r.ownerId,
        ownerName: user.get(r.ownerId) ?? "",
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
  }
}
