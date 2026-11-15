import { Inject, Injectable } from "@nestjs/common";
import type { SearchResult, SearchType } from "@otd/contracts/mainline";
import {
  type Database,
  bookings,
  cartons,
  customerOrders,
  customers,
  handoverPackages,
  inspections,
  packagingPlans,
  plannings,
  purchaseOrders,
  quoteRounds,
  quotes,
  receivables,
  sampleShipments,
  samples,
  shipments,
  styles,
  testReports,
  testRequests,
} from "@otd/db";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { type AccessContext, hasPermission } from "../../core/access/access.types.js";
import { customerScoped, scoped } from "../../core/access/scope.js";
import { likeKeyword } from "../../core/paging.js";
import { DB } from "../../core/tokens.js";

type Source = { type: SearchType; permissions: string[]; run: (ctx: AccessContext, kw: string, limit: number) => Promise<SearchResult[]> };

const ORDER: SearchType[] = ["order", "style", "customer", "planning", "sample", "sampleShipment", "testRequest", "testReport", "quote", "handover", "packaging", "carton", "purchase", "inspection", "booking", "shipment", "receivable"];

@Injectable()
export class SearchService {
  private readonly sources: Source[];

  constructor(@Inject(DB) db: Database) {
    const r =(type: SearchType, id: string, docNo: string, title: string, link: string): SearchResult => ({ type, id, docNo, title, link });
    this.sources = [
      {
        type: "order",
        permissions: ["order.order.view", "order.monitor.view"],
        run: async (ctx, kw, limit) =>
          (
            await db
              .select({ id: customerOrders.id, poNo: customerOrders.poNo, pairs: customerOrders.totalPairs, customer: customers.name })
              .from(customerOrders)
              .innerJoin(customers, eq(customers.id, customerOrders.customerId))
              .where(and(scoped(customerOrders, ctx), ilike(customerOrders.poNo, kw)))
              .orderBy(asc(customerOrders.poNo))
              .limit(limit)
          ).map((x) => r("order", x.id, x.poNo, `${x.poNo} · ${x.customer} · ${x.pairs.toLocaleString("en-US")} 双`, ctx.permissions.has("order.order.view") || ctx.system ? `/orders/${x.id}` : `/orders/monitor?poNo=${encodeURIComponent(x.poNo)}`)),
      },
      {
        type: "style",
        permissions: ["planning.planning.view", "sample.sample.view", "sample.library.view", "order.order.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: styles.id, styleNo: styles.styleNo, name: styles.nameZh, season: styles.seasonCode }).from(styles).where(and(scoped(styles, ctx), ilike(styles.styleNo, kw))).orderBy(asc(styles.styleNo)).limit(limit)).map((x) =>
            r("style", x.id, x.styleNo, `#${x.styleNo} ${x.name}${x.season ? ` · ${x.season}` : ""}`, ctx.system || ctx.permissions.has("order.order.view") ? `/orders?keyword=${encodeURIComponent(x.styleNo)}` : `/planning?keyword=${encodeURIComponent(x.styleNo)}`),
          ),
      },
      {
        type: "customer",
        permissions: ["masterdata.customer.view", "order.order.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: customers.id, code: customers.code, name: customers.name }).from(customers).where(and(customerScoped(customers.id, ctx), or(ilike(customers.name, kw), ilike(customers.code, kw), ilike(customers.nameEn, kw)))).limit(limit)).map((x) =>
            r("customer", x.id, x.code, `${x.name}（${x.code}）`, ctx.system || ctx.permissions.has("order.order.view") ? `/orders?customerId=${x.id}` : `/masterdata/customers/${x.id}`),
          ),
      },
      {
        type: "planning",
        permissions: ["planning.planning.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: plannings.id, docNo: plannings.docNo, styleNo: plannings.styleNo, name: plannings.nameZh }).from(plannings).where(and(scoped(plannings, ctx), ilike(plannings.docNo, kw))).limit(limit)).map((x) =>
            r("planning", x.id, x.docNo, `${x.docNo} · 企划${x.styleNo ? ` · #${x.styleNo}` : ""}${x.name ? ` ${x.name}` : ""}`, `/planning/${x.id}`),
          ),
      },
      {
        type: "sample",
        permissions: ["sample.sample.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: samples.id, docNo: samples.docNo, styleNo: styles.styleNo }).from(samples).innerJoin(styles, eq(styles.id, samples.styleId)).where(and(scoped(samples, ctx), ilike(samples.docNo, kw))).limit(limit)).map((x) => r("sample", x.id, x.docNo, `${x.docNo} · 打样 · #${x.styleNo}`, `/samples/${x.id}`)),
      },
      {
        type: "sampleShipment",
        permissions: ["sampleship.shipment.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: sampleShipments.id, docNo: sampleShipments.docNo }).from(sampleShipments).where(and(scoped(sampleShipments, ctx), ilike(sampleShipments.docNo, kw))).limit(limit)).map((x) => r("sampleShipment", x.id, x.docNo, `${x.docNo} · 寄样`, `/sample-shipments/${x.id}`)),
      },
      {
        type: "testRequest",
        permissions: ["testing.request.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: testRequests.id, docNo: testRequests.docNo }).from(testRequests).where(and(scoped(testRequests, ctx), ilike(testRequests.docNo, kw))).limit(limit)).map((x) => r("testRequest", x.id, x.docNo, `${x.docNo} · 送测`, `/tests/${x.id}`)),
      },
      {
        type: "testReport",
        permissions: ["testing.report.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: testReports.id, docNo: testReports.docNo, agencyNo: testReports.agencyReportNo }).from(testReports).where(and(scoped(testReports, ctx), or(ilike(testReports.docNo, kw), ilike(testReports.agencyReportNo, kw)))).limit(limit)).map((x) =>
            r("testReport", x.id, x.docNo, `${x.docNo} · 测试报告 · ${x.agencyNo}`, `/tests/reports/${x.id}`),
          ),
      },
      {
        type: "quote",
        permissions: ["quote.quote.view"],
        run: async (ctx, kw, limit) =>
          (await db.select({ id: quoteRounds.id, quoteId: quoteRounds.quoteId, docNo: quoteRounds.docNo, kind: quoteRounds.kind }).from(quoteRounds).innerJoin(quotes, eq(quotes.id, quoteRounds.quoteId)).where(and(scoped(quotes, ctx), ilike(quoteRounds.docNo, kw))).limit(limit)).map((x) =>
            r("quote", x.id, x.docNo, `${x.docNo} · ${x.kind === "CUSTOMER" ? "客户报价" : "内部报价"}`, `/quotes/${x.quoteId}`),
          ),
      },
      {
        type: "handover",
        permissions: ["document.handover.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: handoverPackages.id, docNo: handoverPackages.docNo }).from(handoverPackages).where(and(scoped(handoverPackages, ctx), ilike(handoverPackages.docNo, kw))).limit(limit)).map((x) => r("handover", x.id, x.docNo, `${x.docNo} · 开发移交包`, `/documents/handovers/${x.id}`)),
      },
      {
        type: "packaging",
        permissions: ["packaging.plan.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: packagingPlans.id, docNo: packagingPlans.docNo, title: packagingPlans.title }).from(packagingPlans).where(and(scoped(packagingPlans, ctx), ilike(packagingPlans.docNo, kw))).limit(limit)).map((x) => r("packaging", x.id, x.docNo, `${x.docNo} · ${x.title}`, `/packaging/${x.id}`)),
      },
      {
        type: "carton",
        permissions: ["packaging.carton.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: cartons.id, docNo: cartons.docNo }).from(cartons).where(and(scoped(cartons, ctx), ilike(cartons.docNo, kw))).limit(limit)).map((x) => r("carton", x.id, x.docNo, `${x.docNo} · 装箱单`, `/packaging/cartons?keyword=${encodeURIComponent(x.docNo)}`)),
      },
      {
        type: "purchase",
        permissions: ["purchase.order.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: purchaseOrders.id, docNo: purchaseOrders.docNo, supplier: purchaseOrders.supplier }).from(purchaseOrders).where(and(scoped(purchaseOrders, ctx), ilike(purchaseOrders.docNo, kw))).limit(limit)).map((x) => r("purchase", x.id, x.docNo, `${x.docNo} · 采购单 · ${x.supplier}`, `/purchases/${x.id}`)),
      },
      {
        type: "inspection",
        permissions: ["inspection.inspection.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: inspections.id, docNo: inspections.docNo, stage: inspections.stage }).from(inspections).where(and(scoped(inspections, ctx), ilike(inspections.docNo, kw))).limit(limit)).map((x) => r("inspection", x.id, x.docNo, `${x.docNo} · 验货 ${x.stage}`, `/inspections/${x.id}`)),
      },
      {
        type: "booking",
        permissions: ["shipment.booking.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: bookings.id, docNo: bookings.docNo }).from(bookings).where(and(scoped(bookings, ctx), ilike(bookings.docNo, kw))).limit(limit)).map((x) => r("booking", x.id, x.docNo, `${x.docNo} · 订舱`, `/shipments/bookings/${x.id}`)),
      },
      {
        type: "shipment",
        permissions: ["shipment.shipment.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: shipments.id, docNo: shipments.docNo }).from(shipments).where(and(scoped(shipments, ctx), ilike(shipments.docNo, kw))).limit(limit)).map((x) => r("shipment", x.id, x.docNo, `${x.docNo} · 出货`, `/shipments/${x.id}`)),
      },
      {
        type: "receivable",
        permissions: ["receivable.receivable.view"],
        run: async (ctx, kw, limit) => (await db.select({ id: receivables.id, docNo: receivables.docNo, currency: receivables.currency, amount: receivables.amount }).from(receivables).where(and(scoped(receivables, ctx), ilike(receivables.docNo, kw))).limit(limit)).map((x) => r("receivable", x.id, x.docNo, `${x.docNo} · 应收 ${x.currency} ${x.amount.toLocaleString("en-US")}`, `/receivables/${x.id}`)),
      },
    ];
  }

  async search(ctx: AccessContext, q: string, limit = 5): Promise<SearchResult[]> {
    const term = q.trim().replace(/^#/, "");
    const kw = likeKeyword(term);
    if (!kw) return [];
    const allowed = this.sources.filter((s) => s.permissions.some((p) => hasPermission(ctx, p)));
    const groups = await Promise.all(allowed.map((s) => s.run(ctx, kw, limit)));
    const upper = term.toUpperCase();
    return groups.flat().sort((a, b) => {
      const exact = Number(b.docNo.toUpperCase() === upper) - Number(a.docNo.toUpperCase() === upper);
      return exact || ORDER.indexOf(a.type) - ORDER.indexOf(b.type);
    });
  }
}
