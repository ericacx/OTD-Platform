import { Inject, Injectable } from "@nestjs/common";
import type { Page } from "@otd/contracts/common";
import {
  type FlowCardDto,
  type FlowDetailDto,
  type FlowDiffDto,
  type FlowMigrateResult,
  type FlowModuleView,
  type FlowRuntime,
  type FlowStatus,
  type FlowVersionDetailDto,
  type FlowVersionDto,
  type MigrationPreviewDto,
  type ModuleAssignResult,
  type flowCardQuerySchema,
  type flowCopySchema,
  type flowDiffQuerySchema,
  type flowDraftModuleSchema,
  type flowDraftUpdateSchema,
  flowErrors,
  type flowMigrateSchema,
  type flowPublishSchema,
  type flowRollbackSchema,
} from "@otd/contracts/flow";
import { type Database, type DbOrTx, type FlowSnapshot, customerFlowVersions, customerFlows, customerOrders, customers, serviceItems, serviceModules, users } from "@otd/db";
import { STATUS_MACHINES, statusCodes } from "@otd/shared";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, notInArray, or } from "drizzle-orm";
import type { z } from "zod";
import type { AccessContext } from "../../core/access/access.types.js";
import { canSeeCustomer } from "../../core/access/access.types.js";
import { scoped } from "../../core/access/scope.js";
import { AuditService } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, assertFound, notFound, versionConflict } from "../../core/errors.js";
import { type DomainEvent, EventBus, inTransaction } from "../../core/events.js";
import { likeKeyword } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";
import { FlowConfigService } from "./flow-config.service.js";
import {
  type DiffSide,
  GATE_CODES,
  NODE_ORDER,
  allOnRuntime,
  computeRuntime,
  diffFlows,
  diffSummary,
  effectiveParams,
  itemCount,
  sortedModules,
  stableStringify,
  stripEffects,
} from "./flow-rules.js";

type FlowRow = typeof customerFlows.$inferSelect;
type VersionRow = typeof customerFlowVersions.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;
type ModuleRow = typeof serviceModules.$inferSelect;
type ItemRow = typeof serviceItems.$inferSelect & { moduleCode: string };
type Catalog = { modules: Map<string, ModuleRow>; items: Map<string, ItemRow>; itemsByModule: Map<string, ItemRow[]> };

const EMPTY: FlowSnapshot = { modules: [], params: {} };
const OPEN_ORDER_EXCLUDED = statusCodes("order").filter((s) => !(STATUS_MACHINES.order.transitions as Record<string, readonly string[] | undefined>)[s]?.length);

@Injectable()
export class CustomerFlowService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: FlowConfigService,
  ) {}

  async listCards(ctx: AccessContext, q: z.infer<typeof flowCardQuerySchema>): Promise<Page<FlowCardDto>> {
    const conds: SQL[] = [isNull(customers.deletedAt)];
    if (!ctx.system && ctx.customerScope.mode === "LIST") {
      if (!ctx.customerScope.customerIds.length) return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
      conds.push(inArray(customers.id, ctx.customerScope.customerIds));
    }
    const kw = likeKeyword(q.keyword);
    if (kw) conds.push(or(ilike(customers.code, kw), ilike(customers.name, kw), ilike(customers.nameEn, kw), ilike(customers.contactName, kw))!);
    const rows = await this.db
      .select({ c: customers, f: customerFlows, v: customerFlowVersions })
      .from(customers)
      .leftJoin(customerFlows, eq(customerFlows.customerId, customers.id))
      .leftJoin(customerFlowVersions, eq(customerFlowVersions.id, customerFlows.currentVersionId))
      .where(and(...conds))
      .orderBy(asc(customers.code));
    let cards = rows.map((r) => this.card(r.c, r.f, r.v));
    if (q.flowStatus) cards = cards.filter((c) => c.flowStatus === q.flowStatus);
    const start = (q.page - 1) * q.pageSize;
    return { items: cards.slice(start, start + q.pageSize), total: cards.length, page: q.page, pageSize: q.pageSize };
  }

  async detail(ctx: AccessContext, customerId: string): Promise<FlowDetailDto> {
    const customer = await this.customerOf(ctx, customerId);
    const flow = await this.flowOf(customerId);
    const current = flow?.currentVersionId ? await this.versionRow(customerId, flow.currentVersionId) : null;
    const catalog = await this.loadCatalog();
    const draft = flow?.draft ?? EMPTY;
    const inDraft = new Set(draft.modules.map((m) => m.moduleCode));
    const publisher = current?.publishedBy ? await this.userNames([current.publishedBy]) : new Map<string, string>();
    return {
      customer: this.card(customer, flow ?? null, current),
      draft: { modules: this.moduleViews(draft, catalog), params: effectiveParams(draft.params, customer.paymentTermsDays) },
      draftRuntime: await this.config.runtimeOf(customerId, draft, { versionId: null, versionNo: null }),
      availableModules: [...catalog.modules.values()]
        .filter((m) => !m.deletedAt && m.hasPage && !inDraft.has(m.code))
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({ moduleCode: m.code, name: m.name, nameEn: m.nameEn, department: m.department, itemCount: (catalog.itemsByModule.get(m.code) ?? []).filter((i) => !i.deletedAt).length })),
      currentVersion: current ? this.versionDto(current, current.id, publisher) : null,
      hasChanges: flow ? hasChanges(flow, current, customer.paymentTermsDays) : false,
      version: flow?.version ?? 0,
    };
  }

  async updateDraft(ctx: AccessContext, customerId: string, input: z.infer<typeof flowDraftUpdateSchema>): Promise<FlowDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const customer = await this.customerOf(ctx, customerId, tx);
      const flow = await this.flowOf(customerId, tx);
      if ((flow?.version ?? 0) !== input.version) throw versionConflict();
      const catalog = await this.loadCatalog(tx);
      const draft = normalizeDraft(input.modules, input.params, catalog);
      await this.saveDraft(ctx, tx, customer, flow, draft, "flow.customer.draft");
    });
    return this.detail(ctx, customerId);
  }

  async copyFrom(ctx: AccessContext, customerId: string, input: z.infer<typeof flowCopySchema>): Promise<FlowDetailDto> {
    await inTransaction(this.db, this.events, async (tx) => {
      const customer = await this.customerOf(ctx, customerId, tx);
      await this.customerOf(ctx, input.sourceCustomerId, tx);
      const flow = await this.flowOf(customerId, tx);
      if ((flow?.version ?? 0) !== input.version) throw versionConflict();
      const source = await this.flowOf(input.sourceCustomerId, tx);
      const sourceCurrent = source?.currentVersionId ? await this.versionRow(input.sourceCustomerId, source.currentVersionId, tx) : null;
      const template = sourceCurrent?.snapshot ?? source?.draft ?? EMPTY;
      const { paymentTermsDays: _terms, ...params } = template.params as Record<string, unknown>;
      const catalog = await this.loadCatalog(tx);
      const modules = sortedModules(template)
        .filter((m) => catalog.modules.get(m.moduleCode) && !catalog.modules.get(m.moduleCode)!.deletedAt)
        .map((m) => ({ moduleCode: m.moduleCode, department: m.department, items: m.items.filter((i) => catalog.items.get(i.itemCode) && !catalog.items.get(i.itemCode)!.deletedAt).map((i) => ({ itemCode: i.itemCode, ...(i.params ? { params: i.params } : {}) })) }));
      const draft = normalizeDraft(modules, params, catalog);
      await this.saveDraft(ctx, tx, customer, flow, draft, "flow.customer.copy", { sourceCustomerId: input.sourceCustomerId });
    });
    return this.detail(ctx, customerId);
  }

  async assignModule(ctx: AccessContext, moduleId: string, customerIds: string[]): Promise<ModuleAssignResult> {
    return inTransaction(this.db, this.events, async (tx) => {
      const catalog = await this.loadCatalog(tx);
      const mod = [...catalog.modules.values()].find((m) => m.id === moduleId && !m.deletedAt);
      if (!mod) throw notFound();
      if (!mod.hasPage) throw new AppError(flowErrors.FLOW_MODULE_PENDING, { module: mod.name });
      const assigned: string[] = [];
      const skipped: string[] = [];
      for (const customerId of [...new Set(customerIds)]) {
        const customer = await this.customerOf(ctx, customerId, tx);
        const flow = await this.flowOf(customerId, tx);
        const draft = flow?.draft ?? EMPTY;
        if (draft.modules.some((m) => m.moduleCode === mod.code)) {
          skipped.push(customer.code);
          continue;
        }
        const items = (catalog.itemsByModule.get(mod.code) ?? []).filter((i) => !i.deletedAt).map((i) => ({ itemCode: i.code }));
        const next: FlowSnapshot = { modules: [...sortedModules(draft), { moduleCode: mod.code, sort: draft.modules.length + 1, department: mod.department, items }], params: draft.params };
        await this.saveDraft(ctx, tx, customer, flow, next, "flow.customer.assign", { moduleCode: mod.code });
        assigned.push(customer.code);
      }
      return { assigned, skipped };
    });
  }

  async publish(ctx: AccessContext, customerId: string, input: z.infer<typeof flowPublishSchema>): Promise<FlowDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const customer = await this.customerOf(ctx, customerId, tx);
      const flow = assertFound(await this.flowOf(customerId, tx));
      if (flow.version !== input.version) throw versionConflict();
      const catalog = await this.loadCatalog(tx);
      const draft = normalizeDraft(
        sortedModules(flow.draft).map((m) => ({ moduleCode: m.moduleCode, department: m.department, items: m.items.map((i) => ({ itemCode: i.itemCode, ...(i.params ? { params: i.params } : {}) })) })),
        flow.draft.params,
        catalog,
      );
      const snapshot: FlowSnapshot = {
        modules: draft.modules.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i, effects: catalog.items.get(i.itemCode)!.effects })) })),
        params: effectiveParams(draft.params, customer.paymentTermsDays),
      };
      await this.publishSnapshot(ctx, tx, emit, customer, flow, snapshot, catalog, { note: input.note ?? null, action: "flow.customer.publish", reason: input.note });
    });
    return this.detail(ctx, customerId);
  }

  async rollback(ctx: AccessContext, customerId: string, input: z.infer<typeof flowRollbackSchema>): Promise<FlowDetailDto> {
    await inTransaction(this.db, this.events, async (tx, emit) => {
      const customer = await this.customerOf(ctx, customerId, tx);
      const flow = assertFound(await this.flowOf(customerId, tx));
      if (flow.version !== input.version) throw versionConflict();
      const target = assertFound(await this.versionRow(customerId, input.versionId, tx));
      const catalog = await this.loadCatalog(tx);
      const snapshot: FlowSnapshot = { modules: sortedModules(target.snapshot).map((m, i) => ({ ...m, sort: i + 1 })), params: { ...target.snapshot.params } };
      await this.publishSnapshot(ctx, tx, emit, customer, flow, snapshot, catalog, { note: `回退到 v${target.versionNo}：${input.reason}`, action: "flow.customer.rollback", reason: `rollback:v${target.versionNo} ${input.reason}` });
    });
    return this.detail(ctx, customerId);
  }

  async versions(ctx: AccessContext, customerId: string): Promise<FlowVersionDto[]> {
    await this.customerOf(ctx, customerId);
    const flow = await this.flowOf(customerId);
    const rows = await this.db.select().from(customerFlowVersions).where(eq(customerFlowVersions.customerId, customerId)).orderBy(desc(customerFlowVersions.versionNo));
    const names = await this.userNames(rows.map((r) => r.publishedBy).filter((x): x is string => !!x));
    return rows.map((r) => this.versionDto(r, flow?.currentVersionId ?? null, names));
  }

  async version(ctx: AccessContext, customerId: string, versionId: string): Promise<FlowVersionDetailDto> {
    await this.customerOf(ctx, customerId);
    const flow = await this.flowOf(customerId);
    const row = assertFound(await this.versionRow(customerId, versionId));
    const names = await this.userNames(row.publishedBy ? [row.publishedBy] : []);
    const catalog = await this.loadCatalog();
    return {
      ...this.versionDto(row, flow?.currentVersionId ?? null, names),
      modules: this.moduleViews(row.snapshot, catalog),
      params: row.snapshot.params,
      runtime: await this.config.enabledNodes(customerId, row.id),
    };
  }

  async diff(ctx: AccessContext, customerId: string, q: z.infer<typeof flowDiffQuerySchema>): Promise<FlowDiffDto> {
    const customer = await this.customerOf(ctx, customerId);
    const flow = await this.flowOf(customerId);
    const catalog = await this.loadCatalog();
    const from = await this.side(customer, flow, q.from ?? "current", catalog);
    const to = await this.side(customer, flow, q.to ?? "draft", catalog);
    return diffFlows(from, to, nameLookup(catalog));
  }

  async runtime(ctx: AccessContext, customerId: string, versionId?: string): Promise<FlowRuntime> {
    await this.customerOf(ctx, customerId);
    return this.config.enabledNodes(customerId, versionId);
  }

  async migrationPreview(ctx: AccessContext, customerId: string, targetVersionId?: string): Promise<MigrationPreviewDto> {
    const customer = await this.customerOf(ctx, customerId);
    const flow = await this.flowOf(customerId);
    const target = await this.migrationTarget(customerId, flow, targetVersionId);
    const orders = await this.affectedOrders(ctx, customerId, target.id);
    const fromIds = [...new Set(orders.map((o) => o.flowVersionId!))];
    const fromRows = fromIds.length ? await this.db.select().from(customerFlowVersions).where(inArray(customerFlowVersions.id, fromIds)) : [];
    const owners = await this.userNames([...new Set(orders.map((o) => o.ownerId))]);
    const catalog = await this.loadCatalog();
    const targetSide = await this.versionSide(customer, target, catalog);
    const groups: MigrationPreviewDto["groups"] = [];
    for (const id of fromIds) {
      const row = fromRows.find((r) => r.id === id);
      const fromSide: DiffSide = row ? await this.versionSide(customer, row, catalog) : { label: "?", versionId: id, versionNo: null, snapshot: EMPTY, params: effectiveParams(null, customer.paymentTermsDays), runtime: allOnRuntime() };
      groups.push({ fromVersionId: id, fromVersionNo: row?.versionNo ?? null, orderCount: orders.filter((o) => o.flowVersionId === id).length, diff: diffFlows(fromSide, targetSide, nameLookup(catalog)) });
    }
    groups.sort((a, b) => (a.fromVersionNo ?? 0) - (b.fromVersionNo ?? 0));
    return {
      target: { versionId: target.id, versionNo: target.versionNo },
      total: orders.length,
      orders: orders.map((o) => ({ id: o.id, poNo: o.poNo, status: o.status, customerDueDate: o.customerDueDate, fromVersionId: o.flowVersionId!, fromVersionNo: fromRows.find((r) => r.id === o.flowVersionId)?.versionNo ?? null, ownerName: owners.get(o.ownerId) ?? "" })),
      groups,
    };
  }

  async migrate(ctx: AccessContext, customerId: string, input: z.infer<typeof flowMigrateSchema>): Promise<FlowMigrateResult> {
    return inTransaction(this.db, this.events, async (tx, emit) => {
      const customer = await this.customerOf(ctx, customerId, tx);
      const flow = await this.flowOf(customerId, tx);
      const target = await this.migrationTarget(customerId, flow, input.targetVersionId, tx);
      const orders = await this.affectedOrders(ctx, customerId, target.id, tx, input.orderIds);
      const fromNos = new Map((await tx.select({ id: customerFlowVersions.id, n: customerFlowVersions.versionNo }).from(customerFlowVersions).where(eq(customerFlowVersions.customerId, customerId))).map((r) => [r.id, r.n]));
      for (const o of orders) {
        await tx.update(customerOrders).set({ flowVersionId: target.id, version: o.version + 1, updatedBy: ctx.userId }).where(eq(customerOrders.id, o.id));
        await this.audit.log(
          ctx,
          { action: "flow.order.migrate", objectType: "customerOrder", objectId: o.id, docNo: o.poNo, diff: { flowVersion: { from: fromNos.get(o.flowVersionId!) ?? null, to: target.versionNo }, flowVersionId: { from: o.flowVersionId, to: target.id } } },
          tx,
        );
        emit({ type: "flow.order.migrated", aggregateType: "customerOrder", aggregateId: o.id, payload: { customerId, fromVersionId: o.flowVersionId, toVersionId: target.id } });
      }
      await this.audit.log(ctx, { action: "flow.customer.migrate", objectType: "customerFlow", objectId: customerId, docNo: `${customer.code} v${target.versionNo}`, diff: { orders: orders.map((o) => o.poNo) } }, tx);
      return { migrated: orders.length, orderIds: orders.map((o) => o.id), target: { versionId: target.id, versionNo: target.versionNo } };
    });
  }

  private async publishSnapshot(
    ctx: AccessContext,
    tx: DbOrTx,
    emit: (e: DomainEvent) => void,
    customer: CustomerRow,
    flow: FlowRow,
    snapshot: FlowSnapshot,
    catalog: Catalog,
    opts: { note: string | null; action: string; reason?: string },
  ): Promise<void> {
    const effects = await this.config.effectsFor(snapshot, tx);
    const runtime = computeRuntime(snapshot, (c) => effects.get(c));
    for (const gate of GATE_CODES) if (!runtime.gateConditions[gate].length) throw new AppError(flowErrors.FLOW_GATE_EMPTY, { gate });
    const current = flow.currentVersionId ? await this.versionRow(customer.id, flow.currentVersionId, tx) : null;
    const params = effectiveParams(snapshot.params, customer.paymentTermsDays);
    const newSide: DiffSide = { label: "new", versionId: null, versionNo: null, snapshot, params, runtime };
    const fromSide = current ? await this.versionSide(customer, current, catalog, tx) : unconfiguredSide(customer);
    const diff = diffFlows(fromSide, newSide, nameLookup(catalog));
    if (current && diff.identical) throw new AppError(flowErrors.FLOW_NO_CHANGES);
    const all = await tx.select({ n: customerFlowVersions.versionNo }).from(customerFlowVersions).where(eq(customerFlowVersions.customerId, customer.id));
    const versionNo = Math.max(0, ...all.map((r) => r.n)) + 1;
    const created = (
      await tx
        .insert(customerFlowVersions)
        .values({ customerId: customer.id, versionNo, snapshot, summary: diffSummary(diff), note: opts.note, publishedAt: this.clock.now(), publishedBy: ctx.system ? null : ctx.userId })
        .returning()
    )[0]!;
    await this.audit.snapshot(ctx, "customerFlow", customer.id, current?.versionNo ?? 0, { versionId: current?.id ?? null, versionNo: current?.versionNo ?? null, snapshot: current?.snapshot ?? null }, opts.reason, tx);
    const updated = await tx
      .update(customerFlows)
      .set({ currentVersionId: created.id, draft: stripEffects(snapshot), status: "PUBLISHED", version: flow.version + 1, updatedBy: ctx.userId })
      .where(and(eq(customerFlows.id, flow.id), eq(customerFlows.version, flow.version)))
      .returning();
    if (!updated.length) throw versionConflict();
    await this.audit.log(ctx, { action: opts.action, objectType: "customerFlow", objectId: customer.id, docNo: `${customer.code} v${versionNo}`, diff: diffSummary(diff) }, tx);
    emit({ type: "flow.customer.published", aggregateType: "customer", aggregateId: customer.id, payload: { versionId: created.id, versionNo, previousVersionId: current?.id ?? null } });
  }

  private async saveDraft(ctx: AccessContext, tx: DbOrTx, customer: CustomerRow, flow: FlowRow | undefined, draft: FlowSnapshot, action: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (!flow) {
      await tx.insert(customerFlows).values({ customerId: customer.id, draft, status: "DRAFT", createdBy: ctx.userId });
      await this.audit.log(ctx, { action, objectType: "customerFlow", objectId: customer.id, docNo: customer.code, diff: { modules: draft.modules.map((m) => m.moduleCode), items: itemCount(draft), ...extra } }, tx);
      return;
    }
    const updated = await tx
      .update(customerFlows)
      .set({ draft, status: "DRAFT", version: flow.version + 1, updatedBy: ctx.userId })
      .where(and(eq(customerFlows.id, flow.id), eq(customerFlows.version, flow.version)))
      .returning();
    if (!updated.length) throw versionConflict();
    await this.audit.log(
      ctx,
      { action, objectType: "customerFlow", objectId: customer.id, docNo: customer.code, diff: { modules: { from: flow.draft.modules.map((m) => m.moduleCode), to: draft.modules.map((m) => m.moduleCode) }, items: { from: itemCount(flow.draft), to: itemCount(draft) }, ...extra } },
      tx,
    );
  }

  private async migrationTarget(customerId: string, flow: FlowRow | undefined, targetVersionId: string | undefined, db: DbOrTx = this.db): Promise<VersionRow> {
    if (!flow?.currentVersionId) throw new AppError(flowErrors.FLOW_NOT_PUBLISHED);
    if (targetVersionId && targetVersionId !== flow.currentVersionId) throw new AppError(flowErrors.FLOW_VERSION_NOT_CURRENT);
    return assertFound(await this.versionRow(customerId, flow.currentVersionId, db));
  }

  private async affectedOrders(ctx: AccessContext, customerId: string, targetId: string, db: DbOrTx = this.db, orderIds?: string[]) {
    const conds: SQL[] = [
      scoped(customerOrders, ctx),
      eq(customerOrders.customerId, customerId),
      isNotNull(customerOrders.flowVersionId),
      ne(customerOrders.flowVersionId, targetId),
      notInArray(customerOrders.status, OPEN_ORDER_EXCLUDED),
    ];
    if (orderIds) {
      if (!orderIds.length) return [];
      conds.push(inArray(customerOrders.id, orderIds));
    }
    return db
      .select({ id: customerOrders.id, poNo: customerOrders.poNo, status: customerOrders.status, customerDueDate: customerOrders.customerDueDate, flowVersionId: customerOrders.flowVersionId, ownerId: customerOrders.ownerId, version: customerOrders.version })
      .from(customerOrders)
      .where(and(...conds))
      .orderBy(asc(customerOrders.customerDueDate), asc(customerOrders.poNo));
  }

  private async side(customer: CustomerRow, flow: FlowRow | undefined, ref: string, catalog: Catalog): Promise<DiffSide> {
    if (ref === "draft") {
      const draft = flow?.draft ?? EMPTY;
      const effects = await this.config.liveEffects(draft.modules.flatMap((m) => m.items.map((i) => i.itemCode)));
      return { label: "draft", versionId: null, versionNo: null, snapshot: draft, params: effectiveParams(draft.params, customer.paymentTermsDays), runtime: computeRuntime(draft, (c) => effects.get(c)) };
    }
    if (ref === "current") {
      if (!flow?.currentVersionId) return unconfiguredSide(customer);
      return this.versionSide(customer, assertFound(await this.versionRow(customer.id, flow.currentVersionId)), catalog);
    }
    return this.versionSide(customer, assertFound(await this.versionRow(customer.id, ref)), catalog);
  }

  private async versionSide(customer: CustomerRow, row: VersionRow, _catalog: Catalog, db: DbOrTx = this.db): Promise<DiffSide> {
    const effects = await this.config.effectsFor(row.snapshot, db);
    return { label: `v${row.versionNo}`, versionId: row.id, versionNo: row.versionNo, snapshot: row.snapshot, params: effectiveParams(row.snapshot.params, customer.paymentTermsDays), runtime: computeRuntime(row.snapshot, (c) => effects.get(c)) };
  }

  private card(c: CustomerRow, flow: FlowRow | null, current: VersionRow | null): FlowCardDto {
    const changed = flow ? hasChanges(flow, current, c.paymentTermsDays) : false;
    const status: FlowStatus = !flow ? "NONE" : !current || changed ? "DRAFT" : "PUBLISHED";
    const basis = current?.snapshot ?? flow?.draft ?? EMPTY;
    return {
      customerId: c.id,
      code: c.code,
      name: c.name,
      nameEn: c.nameEn,
      logoText: c.logoText,
      contactName: c.contactName,
      paymentTermsDays: c.paymentTermsDays,
      customerStatus: c.status,
      flowStatus: status,
      hasChanges: changed,
      moduleCount: basis.modules.length,
      itemCount: itemCount(basis),
      currentVersionNo: current?.versionNo ?? null,
      publishedAt: current ? current.publishedAt.toISOString() : null,
    };
  }

  private versionDto(r: VersionRow, currentId: string | null, names: Map<string, string>): FlowVersionDto {
    return {
      id: r.id,
      versionNo: r.versionNo,
      note: r.note,
      publishedAt: r.publishedAt.toISOString(),
      publishedBy: r.publishedBy,
      publishedByName: r.publishedBy ? (names.get(r.publishedBy) ?? null) : null,
      moduleCount: r.snapshot.modules.length,
      itemCount: itemCount(r.snapshot),
      isCurrent: r.id === currentId,
      summary: r.summary ?? null,
    };
  }

  private moduleViews(snapshot: FlowSnapshot, catalog: Catalog): FlowModuleView[] {
    return sortedModules(snapshot).map((m, idx) => {
      const mod = catalog.modules.get(m.moduleCode);
      const live = (catalog.itemsByModule.get(m.moduleCode) ?? []).filter((i) => !i.deletedAt);
      const enabled = new Map(m.items.map((i) => [i.itemCode, i]));
      const items = live.map((i) => ({ code: i.code, name: i.name, nameEn: i.nameEn, enabled: enabled.has(i.code), params: enabled.get(i.code)?.params ?? null, requiresCustomerConfirm: i.requiresCustomerConfirm, deleted: false }));
      for (const it of m.items) {
        if (live.some((i) => i.code === it.itemCode)) continue;
        const old = catalog.items.get(it.itemCode);
        items.push({ code: it.itemCode, name: old?.name ?? it.itemCode, nameEn: old?.nameEn ?? null, enabled: true, params: it.params ?? null, requiresCustomerConfirm: old?.requiresCustomerConfirm ?? false, deleted: true });
      }
      const nodes = new Set(m.items.flatMap((i) => (i.effects ?? catalog.items.get(i.itemCode)?.effects ?? {}).nodes ?? []));
      return {
        moduleId: mod?.id ?? null,
        moduleCode: m.moduleCode,
        name: mod?.name ?? m.moduleCode,
        nameEn: mod?.nameEn ?? null,
        department: m.department,
        defaultDepartment: mod?.department ?? m.department,
        hasPage: mod?.hasPage ?? false,
        sort: idx + 1,
        nodes: NODE_ORDER.filter((n) => nodes.has(n)),
        items,
        enabledCount: m.items.length,
        totalCount: live.length,
      };
    });
  }

  private async customerOf(ctx: AccessContext, customerId: string, db: DbOrTx = this.db): Promise<CustomerRow> {
    const row = (await db.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.deletedAt))))[0];
    if (!row || !canSeeCustomer(ctx, row.id)) throw notFound();
    return row;
  }

  private async flowOf(customerId: string, db: DbOrTx = this.db): Promise<FlowRow | undefined> {
    return (await db.select().from(customerFlows).where(eq(customerFlows.customerId, customerId)))[0];
  }

  private async versionRow(customerId: string, versionId: string, db: DbOrTx = this.db): Promise<VersionRow | null> {
    return (await db.select().from(customerFlowVersions).where(and(eq(customerFlowVersions.id, versionId), eq(customerFlowVersions.customerId, customerId))))[0] ?? null;
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    return new Map((await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(ids)]))).map((u) => [u.id, u.name]));
  }

  private async loadCatalog(db: DbOrTx = this.db): Promise<Catalog> {
    const mods = await db.select().from(serviceModules).orderBy(asc(serviceModules.sort));
    const items = await db.select().from(serviceItems).orderBy(asc(serviceItems.sort), asc(serviceItems.code));
    const modById = new Map(mods.map((m) => [m.id, m]));
    const catalog: Catalog = { modules: new Map(mods.map((m) => [m.code, m])), items: new Map(), itemsByModule: new Map() };
    for (const i of items) {
      const mod = modById.get(i.moduleId);
      if (!mod) continue;
      const row = { ...i, moduleCode: mod.code };
      catalog.items.set(i.code, row);
      const list = catalog.itemsByModule.get(mod.code) ?? [];
      list.push(row);
      catalog.itemsByModule.set(mod.code, list);
    }
    return catalog;
  }
}

function normalizeDraft(modules: z.infer<typeof flowDraftModuleSchema>[], params: Record<string, unknown>, catalog: Catalog): FlowSnapshot {
  const seen = new Set<string>();
  const out: FlowSnapshot["modules"] = [];
  for (const m of modules) {
    const mod = catalog.modules.get(m.moduleCode);
    if (!mod || mod.deletedAt) throw new AppError(flowErrors.FLOW_UNKNOWN_CODE, { code: m.moduleCode });
    if (!mod.hasPage) throw new AppError(flowErrors.FLOW_MODULE_PENDING, { module: mod.name });
    if (seen.has(mod.code)) throw new AppError(flowErrors.FLOW_MODULE_DUPLICATE, { module: mod.name });
    seen.add(mod.code);
    const picked = new Map<string, { itemCode: string; params?: Record<string, unknown> }>();
    for (const it of m.items) {
      const item = catalog.items.get(it.itemCode);
      if (!item || item.deletedAt) throw new AppError(flowErrors.FLOW_UNKNOWN_CODE, { code: it.itemCode });
      if (item.moduleCode !== mod.code) throw new AppError(flowErrors.FLOW_ITEM_MODULE_MISMATCH, { item: item.name, module: mod.name });
      picked.set(item.code, it.params && Object.keys(it.params).length ? { itemCode: item.code, params: it.params } : { itemCode: item.code });
    }
    const order = (catalog.itemsByModule.get(mod.code) ?? []).map((i) => i.code);
    const items = [...picked.values()].sort((a, b) => order.indexOf(a.itemCode) - order.indexOf(b.itemCode));
    out.push({ moduleCode: mod.code, sort: out.length + 1, department: m.department ?? mod.department, items });
  }
  return { modules: out, params: { ...params } };
}

function canonical(snapshot: FlowSnapshot, terms: number): string {
  return stableStringify({
    modules: sortedModules(snapshot).map((m) => ({ code: m.moduleCode, department: m.department, items: [...m.items].map((i) => ({ code: i.itemCode, params: i.params ?? {} })).sort((a, b) => a.code.localeCompare(b.code)) })),
    params: effectiveParams(snapshot.params, terms),
  });
}

function hasChanges(flow: FlowRow, current: VersionRow | null, terms: number): boolean {
  if (!current) return true;
  return canonical(flow.draft, terms) !== canonical(current.snapshot, terms);
}

function unconfiguredSide(customer: CustomerRow): DiffSide {
  return { label: "unconfigured", versionId: null, versionNo: null, snapshot: EMPTY, params: effectiveParams(null, customer.paymentTermsDays), runtime: allOnRuntime() };
}

function nameLookup(catalog: Catalog) {
  return { module: (c: string) => catalog.modules.get(c)?.name ?? c, item: (c: string) => catalog.items.get(c)?.name ?? c };
}
