import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { FlowRuntime } from "@otd/contracts/flow";
import type { MainlineDto, MonitorDto } from "@otd/contracts/mainline";
import {
  type Database,
  bookings,
  cartons,
  customerOrders,
  customers,
  dictionaries,
  factories,
  handoverPackages,
  inspections,
  nodeStateSnapshots,
  orderLines,
  packagingPlans,
  patrolHits,
  patrolRules,
  plannings,
  productionProgress,
  purchaseOrders,
  quoteRounds,
  quotes,
  receivables,
  sampleRounds,
  samples,
  shipments,
  styles,
  testReportLinks,
  testReports,
  testRequests,
} from "@otd/db";
import { GATES, type Label, type NodeCode } from "@otd/shared";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AccessContext } from "../../core/access/access.types.js";
import { assertCanSee, scoped } from "../../core/access/scope.js";
import { Clock } from "../../core/clock.js";
import { notFound } from "../../core/errors.js";
import { EventBus } from "../../core/events.js";
import { Scheduler } from "../../core/scheduler.js";
import { DB } from "../../core/tokens.js";
import { FlowConfigService } from "../flow/flow-config.service.js";
import { ruleCheckOptions, runRuleCheck } from "../order/rule-check.js";
import { type EngineOptions, type MainlineResult, type OrderFacts, type StyleFacts, deriveMainline } from "./engine.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_NODE: Record<string, NodeCode> = {
  planning: "N01",
  sample: "N02",
  sampleRound: "N02",
  sampleShipment: "N02",
  testRequest: "N03",
  testReport: "N03",
  quote: "N04",
  quoteRound: "N04",
  handover: "N05",
  packagingPlan: "N07",
  packaging: "N07",
  carton: "N08",
  purchase: "N08",
  inspection: "N09",
  booking: "N10",
  shipment: "N10",
  receivable: "N10",
};
const ORDER_RULE_NODE: Record<string, NodeCode> = { PO_REVIEW_OVERDUE: "N06", FACTORY_REPLY_MISSING: "N08" };

type Loaded = { facts: OrderFacts; options: EngineOptions; order: typeof customerOrders.$inferSelect; customerName: string; styleNos: string[] };

@Injectable()
export class MainlineService implements OnModuleInit {
  private readonly logger = new Logger("Mainline");

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    private readonly flow: FlowConfigService,
  ) {}

  onModuleInit(): void {
    this.events.on("*", "mainline.recompute", async (event) => {
      try {
        for (const orderId of await this.affectedOrders(event.aggregateType, event.aggregateId, event.payload)) await this.recompute(orderId);
      } catch (err) {
        this.logger.warn(`recompute after ${event.type} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    this.scheduler.register({ name: "mainline.recalibrate", dailyAt: "02:40", run: () => this.recomputeAll() });
  }

  async mainline(ctx: AccessContext, orderId: string): Promise<MainlineDto> {
    assertCanSee(ctx, (await this.db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0]);
    const computed = await this.recompute(orderId);
    if (!computed) throw notFound();
    return computed.dto;
  }

  async monitor(ctx: AccessContext, poNo: string): Promise<MonitorDto> {
    const row = (await this.db.select().from(customerOrders).where(and(scoped(customerOrders, ctx), sql`upper(${customerOrders.poNo}) = ${poNo.trim().toUpperCase()}`)).orderBy(desc(customerOrders.createdAt)).limit(1))[0];
    if (!row) throw notFound();
    const computed = await this.recompute(row.id);
    if (!computed) throw notFound();
    const { loaded } = computed;
    const factory = row.factoryId ? (await this.db.select({ name: factories.name }).from(factories).where(eq(factories.id, row.factoryId)))[0] : undefined;
    const nos = loaded.styleNos;
    return {
      order: {
        id: row.id,
        poNo: row.poNo,
        customerId: row.customerId,
        customerName: loaded.customerName,
        seasonCode: row.seasonCode,
        styleNos: nos,
        styleSummary: nos.length > 1 ? `#${nos[0]} 等 ${nos.length} 款` : nos.length ? `#${nos[0]}` : "—",
        totalPairs: row.totalPairs,
        customerDueDate: row.customerDueDate,
        factoryName: factory?.name ?? null,
        status: row.status,
      },
      mainline: computed.dto,
    };
  }

  async currentNodes(orderIds: string[]): Promise<Map<string, { code: NodeCode; state: string } | null>> {
    const out = new Map<string, { code: NodeCode; state: string } | null>();
    if (!orderIds.length) return out;
    let rows = await this.db.select({ orderId: nodeStateSnapshots.orderId, code: nodeStateSnapshots.nodeCode, state: nodeStateSnapshots.state }).from(nodeStateSnapshots).where(inArray(nodeStateSnapshots.orderId, orderIds));
    const missing = orderIds.filter((id) => !rows.some((r) => r.orderId === id));
    if (missing.length) {
      for (const id of missing) await this.recompute(id).catch((err: unknown) => this.logger.warn(`recompute ${id} failed: ${err instanceof Error ? err.message : String(err)}`));
      rows = [...rows, ...(await this.db.select({ orderId: nodeStateSnapshots.orderId, code: nodeStateSnapshots.nodeCode, state: nodeStateSnapshots.state }).from(nodeStateSnapshots).where(inArray(nodeStateSnapshots.orderId, missing)))];
    }
    for (const id of orderIds) {
      const cur = rows
        .filter((r) => r.orderId === id && (r.state === "IN_PROGRESS" || r.state === "BLOCKED"))
        .sort((a, b) => a.code.localeCompare(b.code))[0];
      out.set(id, cur ? { code: cur.code as NodeCode, state: cur.state } : null);
    }
    return out;
  }

  async recomputeAll(): Promise<number> {
    const ids = (await this.db.select({ id: customerOrders.id }).from(customerOrders)).map((r) => r.id);
    for (const id of ids) await this.recompute(id);
    return ids.length;
  }

  async recompute(orderId: string): Promise<{ result: MainlineResult; dto: MainlineDto; loaded: Loaded } | null> {
    const loaded = await this.load(orderId);
    if (!loaded) return null;
    const result = deriveMainline(loaded.facts, loaded.options);
    const now = this.clock.now();
    const existing = await this.db.select().from(nodeStateSnapshots).where(eq(nodeStateSnapshots.orderId, orderId));
    const times = new Map<string, { enteredAt: Date | null; completedAt: Date | null }>();
    for (const n of result.nodes) {
      const prev = existing.find((e) => e.nodeCode === n.code);
      const started = n.state === "IN_PROGRESS" || n.state === "BLOCKED" || n.state === "DONE";
      const enteredAt = started ? (prev?.enteredAt ?? now) : null;
      const completedAt = n.state === "DONE" ? (prev?.state === "DONE" && prev.completedAt ? prev.completedAt : now) : null;
      times.set(n.code, { enteredAt, completedAt });
      const values = { orderId, nodeCode: n.code, state: n.state, enteredAt, completedAt, blockedReasons: n.blockedReasons.map((r) => r.zh), summary: n.summary.zh, computedAt: now };
      await this.db
        .insert(nodeStateSnapshots)
        .values(values)
        .onConflictDoUpdate({ target: [nodeStateSnapshots.orderId, nodeStateSnapshots.nodeCode], set: { state: values.state, enteredAt, completedAt, blockedReasons: values.blockedReasons, summary: values.summary, computedAt: now } });
    }
    const dto: MainlineDto = {
      orderId,
      poNo: loaded.order.poNo,
      nodes: result.nodes.map((n) => ({ ...n, enteredAt: times.get(n.code)?.enteredAt?.toISOString() ?? null, completedAt: times.get(n.code)?.completedAt?.toISOString() ?? null })),
      completedCount: result.completedCount,
      total: result.total,
      currentNode: result.currentNode,
      closed: result.closed,
      headline: result.headline,
      computedAt: now.toISOString(),
    };
    return { result, dto, loaded };
  }

  async affectedOrders(type: string, id: string, payload: Record<string, unknown> = {}): Promise<string[]> {
    const ids = new Set<string>();
    const styleIds = new Set<string>();
    const addAll = (target: Set<string>, v: unknown) => {
      for (const x of Array.isArray(v) ? v : [v]) if (typeof x === "string" && UUID.test(x)) target.add(x);
    };
    addAll(ids, payload.orderId);
    addAll(ids, payload.orderIds);
    addAll(styleIds, payload.styleId);
    addAll(styleIds, payload.styleIds);
    if (UUID.test(id)) {
      const db = this.db;
      const first = <T>(rows: T[]) => rows[0];
      switch (type) {
        case "order":
        case "customerOrder":
          ids.add(id);
          break;
        case "packagingPlan":
        case "packaging":
          addAll(ids, first(await db.select({ v: packagingPlans.orderId }).from(packagingPlans).where(eq(packagingPlans.id, id)))?.v);
          break;
        case "carton":
          addAll(ids, first(await db.select({ v: cartons.orderId }).from(cartons).where(eq(cartons.id, id)))?.v);
          break;
        case "purchase":
          addAll(ids, first(await db.select({ v: purchaseOrders.orderId }).from(purchaseOrders).where(eq(purchaseOrders.id, id)))?.v);
          break;
        case "inspection":
          addAll(ids, first(await db.select({ v: inspections.orderId }).from(inspections).where(eq(inspections.id, id)))?.v);
          break;
        case "booking":
          addAll(ids, first(await db.select({ v: bookings.orderId }).from(bookings).where(eq(bookings.id, id)))?.v);
          break;
        case "shipment":
          addAll(ids, first(await db.select({ v: shipments.orderId }).from(shipments).where(eq(shipments.id, id)))?.v);
          break;
        case "receivable": {
          const r = first(await db.select({ o: receivables.orderId, s: receivables.shipmentId }).from(receivables).where(eq(receivables.id, id)));
          addAll(ids, r?.o);
          if (!r?.o && r?.s) addAll(ids, first(await db.select({ v: shipments.orderId }).from(shipments).where(eq(shipments.id, r.s)))?.v);
          break;
        }
        case "style":
          styleIds.add(id);
          break;
        case "planning":
          addAll(styleIds, first(await db.select({ v: plannings.styleId }).from(plannings).where(eq(plannings.id, id)))?.v);
          break;
        case "sample":
          addAll(styleIds, first(await db.select({ v: samples.styleId }).from(samples).where(eq(samples.id, id)))?.v);
          break;
        case "sampleRound":
          addAll(styleIds, first(await db.select({ v: samples.styleId }).from(sampleRounds).innerJoin(samples, eq(samples.id, sampleRounds.sampleId)).where(eq(sampleRounds.id, id)))?.v);
          break;
        case "testRequest":
          addAll(styleIds, first(await db.select({ v: testRequests.styleId }).from(testRequests).where(eq(testRequests.id, id)))?.v);
          break;
        case "testReport":
          addAll(styleIds, first(await db.select({ v: testReports.styleId }).from(testReports).where(eq(testReports.id, id)))?.v);
          addAll(styleIds, (await db.select({ v: testReportLinks.styleId }).from(testReportLinks).where(eq(testReportLinks.reportId, id))).map((r) => r.v));
          break;
        case "quote":
          addAll(styleIds, first(await db.select({ v: quotes.styleId }).from(quotes).where(eq(quotes.id, id)))?.v);
          break;
        case "quoteRound":
          addAll(styleIds, first(await db.select({ v: quotes.styleId }).from(quoteRounds).innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId)).where(eq(quoteRounds.id, id)))?.v);
          break;
        case "handover":
          addAll(styleIds, first(await db.select({ v: handoverPackages.styleId }).from(handoverPackages).where(eq(handoverPackages.id, id)))?.v);
          break;
        case "patrolHit": {
          const hit = first(await db.select({ t: patrolHits.targetType, id: patrolHits.targetId }).from(patrolHits).where(eq(patrolHits.id, id)));
          if (hit && hit.t !== "patrolHit") for (const o of await this.affectedOrders(hit.t, hit.id)) ids.add(o);
          break;
        }
        default:
          break;
      }
    }
    if (styleIds.size) {
      for (const r of await this.db.selectDistinct({ id: orderLines.orderId }).from(orderLines).where(inArray(orderLines.styleId, [...styleIds]))) ids.add(r.id);
    }
    return [...ids];
  }

  private async load(orderId: string): Promise<Loaded | null> {
    const db = this.db;
    const order = (await db.select().from(customerOrders).where(eq(customerOrders.id, orderId)))[0];
    if (!order) return null;
    const today = this.clock.today();
    const lineRows = await db.select({ id: orderLines.styleId, quantity: orderLines.quantity, unitPrice: orderLines.unitPrice }).from(orderLines).where(eq(orderLines.orderId, orderId));
    const styleIds = [...new Set(lineRows.map((r) => r.id))];
    const ruleCheck =
      order.ruleCheck ??
      (order.status === "PENDING_CONFIRM"
        ? await runRuleCheck(db, { totalPairs: order.totalPairs, orderDate: order.orderDate, customerDueDate: order.customerDueDate, factoryId: order.factoryId, currency: order.currency, lines: lineRows.map((l) => ({ styleId: l.id, quantity: l.quantity, unitPrice: l.unitPrice })), unmatched: order.unmatchedLines }, today, ruleCheckOptions(await this.flow.rulePack("PO_REVIEW", order.customerId)))
        : null);
    const has = styleIds.length > 0;
    const styleRows = has ? await db.select({ id: styles.id, styleNo: styles.styleNo }).from(styles).where(inArray(styles.id, styleIds)).orderBy(asc(styles.styleNo)) : [];
    const planningRows = has ? await db.select().from(plannings).where(inArray(plannings.styleId, styleIds)).orderBy(desc(plannings.createdAt)) : [];
    const sampleRows = has ? await db.select({ id: samples.id, docNo: samples.docNo, styleId: samples.styleId, costStatus: samples.costStatus }).from(samples).where(inArray(samples.styleId, styleIds)) : [];
    const roundRows = sampleRows.length ? await db.select().from(sampleRounds).where(inArray(sampleRounds.sampleId, sampleRows.map((s) => s.id))) : [];
    const requestRows = has ? await db.select().from(testRequests).where(inArray(testRequests.styleId, styleIds)).orderBy(desc(testRequests.createdAt)) : [];
    const linkRows = has ? await db.select().from(testReportLinks).where(inArray(testReportLinks.styleId, styleIds)) : [];
    const reportCond = linkRows.length ? or(inArray(testReports.styleId, styleIds), inArray(testReports.id, linkRows.map((l) => l.reportId))) : inArray(testReports.styleId, styleIds);
    const reportRows = has ? await db.select().from(testReports).where(reportCond) : [];
    const quoteRows = has ? await db.select({ id: quotes.id, styleId: quotes.styleId }).from(quotes).where(inArray(quotes.styleId, styleIds)) : [];
    const qRoundRows = quoteRows.length ? await db.select().from(quoteRounds).where(inArray(quoteRounds.quoteId, quoteRows.map((q) => q.id))) : [];
    const handoverRows = has ? await db.select().from(handoverPackages).where(inArray(handoverPackages.styleId, styleIds)) : [];
    const plans = await db.select().from(packagingPlans).where(eq(packagingPlans.orderId, orderId)).orderBy(desc(packagingPlans.createdAt));
    const cartonRows = await db.select({ id: cartons.id, docNo: cartons.docNo, status: cartons.status }).from(cartons).where(eq(cartons.orderId, orderId));
    const purchaseRows = await db.select({ id: purchaseOrders.id, docNo: purchaseOrders.docNo, status: purchaseOrders.status, promisedDate: purchaseOrders.promisedDate }).from(purchaseOrders).where(eq(purchaseOrders.orderId, orderId));
    const prod = (await db.select({ rate: productionProgress.completionRate, reportDate: productionProgress.reportDate }).from(productionProgress).where(eq(productionProgress.orderId, orderId)).orderBy(desc(productionProgress.reportDate), desc(productionProgress.createdAt)).limit(1))[0];
    const inspRows = await db.select().from(inspections).where(eq(inspections.orderId, orderId)).orderBy(asc(inspections.createdAt));
    const bookingRows = await db.select({ id: bookings.id, docNo: bookings.docNo, status: bookings.status }).from(bookings).where(and(eq(bookings.orderId, orderId), ne(bookings.status, "CANCELLED")));
    const shipRows = await db.select({ id: shipments.id, docNo: shipments.docNo, status: shipments.status }).from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt));
    const arCond = shipRows.length ? or(eq(receivables.orderId, orderId), inArray(receivables.shipmentId, shipRows.map((s) => s.id))) : eq(receivables.orderId, orderId);
    const arRows = await db.select({ id: receivables.id, docNo: receivables.docNo, status: receivables.status, dueDate: receivables.dueDate }).from(receivables).where(arCond);
    const factory = order.factoryId ? (await db.select({ name: factories.name }).from(factories).where(eq(factories.id, order.factoryId)))[0] : undefined;
    const customer = (await db.select({ name: customers.name }).from(customers).where(eq(customers.id, order.customerId)))[0];
    const transport = order.transportMode ? (await db.select({ label: dictionaries.label }).from(dictionaries).where(and(eq(dictionaries.type, "transportMode"), eq(dictionaries.code, order.transportMode))))[0]?.label ?? { zh: order.transportMode, en: order.transportMode } : null;

    const targetIds = [orderId, ...planningRows.map((p) => p.id), ...sampleRows.map((s) => s.id), ...roundRows.map((r) => r.id), ...requestRows.map((r) => r.id), ...reportRows.map((r) => r.id), ...quoteRows.map((q) => q.id), ...qRoundRows.map((r) => r.id), ...handoverRows.map((h) => h.id), ...plans.map((p) => p.id), ...cartonRows.map((c) => c.id), ...purchaseRows.map((p) => p.id), ...inspRows.map((i) => i.id), ...bookingRows.map((b) => b.id), ...shipRows.map((s) => s.id), ...arRows.map((a) => a.id)];
    const hits = await db
      .select({ targetType: patrolHits.targetType, message: patrolHits.message, ruleType: patrolRules.ruleType })
      .from(patrolHits)
      .innerJoin(patrolRules, eq(patrolRules.id, patrolHits.ruleId))
      .where(and(inArray(patrolHits.targetId, targetIds), eq(patrolHits.light, "RED"), ne(patrolHits.status, "CLOSED")));
    const redHits = hits.flatMap((h) => {
      const node = h.targetType === "order" ? (ORDER_RULE_NODE[h.ruleType] ?? "N06") : TARGET_NODE[h.targetType];
      return node ? [{ node, message: h.message }] : [];
    });

    const g1 = new Map<string, Label>(GATES.G1.conditions.map((c) => [c.key, c.label]));
    const runtime = await this.runtime(order.customerId, order.flowVersionId);
    const styleFacts: StyleFacts[] = styleRows.map((s) => {
      const planning = planningRows.find((p) => p.styleId === s.id);
      const mySamples = sampleRows.filter((x) => x.styleId === s.id);
      const myQuotes = quoteRows.filter((q) => q.styleId === s.id).map((q) => q.id);
      const linked = new Set(linkRows.filter((l) => l.styleId === s.id).map((l) => l.reportId));
      const handover = handoverRows.find((h) => h.styleId === s.id);
      return {
        styleId: s.id,
        styleNo: s.styleNo,
        planning: planning ? { id: planning.id, docNo: planning.docNo, status: planning.status, seasonCode: planning.seasonCode, confirmed: !!planning.confirmedAt } : null,
        costReview: mySamples.some((x) => !!x.costStatus && !["NONE", "PENDING"].includes(x.costStatus)),
        rounds: roundRows.filter((r) => mySamples.some((x) => x.id === r.sampleId)).map((r) => ({ id: r.id, sampleId: r.sampleId, sampleDocNo: mySamples.find((x) => x.id === r.sampleId)!.docNo, roundNo: r.roundNo, roundType: r.roundType, status: r.status })),
        testRequests: requestRows.filter((r) => r.styleId === s.id).map((r) => ({ id: r.id, docNo: r.docNo, status: r.status, result: r.result })),
        testReports: reportRows.filter((r) => r.styleId === s.id || linked.has(r.id)).map((r) => ({ id: r.id, docNo: r.docNo, agencyReportNo: r.agencyReportNo, result: r.result, validUntil: r.validUntil })),
        quoteRounds: qRoundRows.filter((r) => myQuotes.includes(r.quoteId)).map((r) => ({ id: r.id, quoteId: r.quoteId, docNo: r.docNo, kind: r.kind, roundNo: r.roundNo, status: r.status, guardrailPassed: r.guardrailPassed, overrideApproved: !!r.overrideApprovedBy })),
        handover: handover
          ? {
              id: handover.id,
              docNo: handover.docNo,
              status: handover.status,
              missing: Object.entries(handover.checklist ?? {})
                .filter(([k, v]) => !v.ok && (!g1.has(k) || runtime.gateConditions.G1.includes(k)))
                .map(([k, v]) => {
                  const label = g1.get(k) ?? { zh: k, en: k };
                  return v.note ? { zh: `${label.zh}（${v.note}）`, en: `${label.en} (${v.note})` } : label;
                }),
            }
          : null,
      };
    });

    const facts: OrderFacts = {
      order: { id: order.id, poNo: order.poNo, status: order.status, ruleCheck, unmatchedStyleNos: [...new Set(order.unmatchedLines.map((u) => u.styleNo))], factoryReplyDate: order.factoryReplyDate, factoryName: factory?.name ?? null, transportMode: transport },
      styles: styleFacts,
      packagingPlans: plans.map((p) => ({ id: p.id, docNo: p.docNo, status: p.status, confirmed: p.status === "CONFIRMED" || p.effectiveVersion !== null || p.confirmedAt !== null, version: p.effectiveVersion ?? p.currentVersion })),
      cartons: cartonRows,
      purchases: purchaseRows,
      production: prod ? { completionRate: prod.rate, reportDate: prod.reportDate } : null,
      inspections: inspRows.map((i) => ({ id: i.id, docNo: i.docNo, stage: i.stage, status: i.status, result: i.result, roundNo: i.roundNo, styleId: i.styleId, releaseCheck: i.releaseCheck })),
      bookings: bookingRows,
      shipments: shipRows,
      receivables: arRows,
      redHits,
    };
    const options: EngineOptions = runtime.configured ? { today, enabledNodes: new Set(runtime.nodes), features: { packaging: runtime.modules.includes("SM07"), purchase: runtime.modules.includes("SM09") } } : { today, enabledNodes: null };
    return { facts, options, order, customerName: customer?.name ?? "", styleNos: [...styleRows.map((s) => s.styleNo), ...facts.order.unmatchedStyleNos.filter((n) => !styleRows.some((s) => s.styleNo === n))] };
  }

  private async runtime(customerId: string, versionId: string | null): Promise<FlowRuntime> {
    try {
      return await this.flow.enabledNodes(customerId, versionId);
    } catch (err) {
      this.logger.warn(`flow version ${versionId ?? "current"} of ${customerId} unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return this.flow.enabledNodes(customerId, null).catch(() => ({ customerId, versionId: null, versionNo: null, configured: false, nodes: [], gateConditions: { G1: [], G2: [] }, modules: [], items: [], params: {} as FlowRuntime["params"] }));
    }
  }

}
