import { auditLogs, syncBatches, syncEndpoints, syncMappings, syncRecords, syncRuns, syncTasks, users } from "../../schema/index.js";
import type { MappingField } from "../../schema/platform.js";
import type { SeedContext } from "./context.js";

const MIN = 60_000;

type Step = { key: string; at: string; ok: boolean; message: string | null };

function steps(start: Date, end: Date, ok: boolean, message: string): Step[] {
  return [
    { key: "START", at: start.toISOString(), ok: true, message: null },
    { key: "RESULT", at: end.toISOString(), ok, message },
    { key: "LOG", at: new Date(end.getTime() + 20_000).toISOString(), ok: true, message: "已写回日志" },
  ];
}

const NSR_ORDER_FIELDS: MappingField[] = [
  { source: "poNo", target: "PONumber", transform: "trim", required: true },
  { source: "customerDueDate", target: "ShipDate", transform: "dateFormat", args: { to: "YYYY-MM-DD" }, required: true },
  { source: "factoryReplyDate", target: "ShipWindowEnd", transform: "dateFormat", args: { to: "YYYY-MM-DD" } },
  { source: "factoryCode", target: "VendorSiteCode", transform: "codeMap", args: { map: "plant" } },
  { source: "totalPairs", target: "OrderQty", transform: "number", args: { integer: true } },
  { source: "status", target: "OrderStatus", transform: "enumMap", args: { values: { PENDING_CONFIRM: "OPEN", TO_SCHEDULE: "CONFIRMED", IN_PRODUCTION: "IN_WORK", TO_SHIP: "READY", COMPLETED: "SHIPPED" } } },
  { source: "", target: "SupplierCode", transform: "default", args: { value: "OTD-0001" } },
];

const ERP_STYLE_FIELDS: MappingField[] = [
  { source: "ITEM_NO", target: "styleNo", transform: "trim", required: true },
  { source: "ITEM_NAME", target: "nameZh", transform: "trim" },
  { source: "CUST_CODE", target: "customerCode", transform: "codeMap", args: { map: "customer" }, required: true },
  { source: "SEASON", target: "seasonCode", transform: "codeMap", args: { map: "season" } },
  { source: "UPD_DATE", target: "erpUpdatedOn", transform: "dateFormat", args: { from: "YYYYMMDD", to: "YYYY-MM-DD" } },
];

const MRN_REPORT_FIELDS: MappingField[] = [
  { source: "docNo", target: "ReportRef", transform: "trim", required: true },
  { source: "agencyReportNo", target: "LabReportNo", transform: "trim", required: true },
  { source: "styleNo", target: "ArticleNo", transform: "concat", args: { sources: ["customerCode", "styleNo"], separator: "-" } },
  { source: "result", target: "Result", transform: "enumMap", args: { values: { PASS: "P", FAIL: "F" }, fallback: "N/A" } },
  { source: "issuedDate", target: "IssueDate", transform: "dateFormat", args: { to: "DD.MM.YYYY" } },
  { source: "validUntil", target: "ExpiryDate", transform: "dateFormat", args: { to: "DD.MM.YYYY" } },
];

export async function seedSyncDemo(ctx: SeedContext): Promise<void> {
  const { db } = ctx;
  const admin = ctx.user("13800000000");
  const planner = ctx.user("13800000008");
  const tracker = ctx.user("13800000012");
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const now = ctx.now.getTime();
  const ymd = (offset: number) => ctx.day(offset).replace(/-/g, "");

  const [erp, nsr, mrn] = await db
    .insert(syncEndpoints)
    .values([
      {
        code: "ERP-HS",
        name: "环思 ERP（模拟）",
        kind: "ERP",
        protocol: "MOCK",
        contact: "信息部 · 环思接口组",
        options: {
          mock: {
            dataset: [
              { key: "12593", updatedAt: ctx.at(-1, 8).toISOString(), data: { ITEM_NO: "12593", ITEM_NAME: "女士船袜 · 散点花卉", CUST_CODE: "C001", SEASON: "2026AW", UPD_DATE: ymd(-1) } },
              { key: "11151", updatedAt: ctx.at(-1, 9).toISOString(), data: { ITEM_NO: "11151", ITEM_NAME: "跑步中筒袜", CUST_CODE: "C002", SEASON: "2026HO", UPD_DATE: ymd(-1) } },
              { key: "11152", updatedAt: ctx.at(0, 1).toISOString(), data: { ITEM_NO: "11152", ITEM_NAME: "家居地板袜", CUST_CODE: "C003", SEASON: "2026HO", UPD_DATE: ymd(0) } },
            ],
          },
        },
        ownerId: admin,
        note: "企业内部 ERP，主数据以 ERP 为准；适配器不改环思字段",
        lastTestAt: ctx.at(0, 1),
        lastTestOk: true,
        lastTestMessage: "模拟对端连接正常",
        createdBy: admin,
        createdAt: ctx.at(-60),
        updatedAt: ctx.at(-60),
      },
      {
        code: "NSR-SPL",
        name: "NSR 客户系统（模拟）",
        kind: "CUSTOMER",
        customerId: ctx.customer("NSR"),
        protocol: "MOCK",
        contact: "NorthShore Supplier Portal 支持组",
        options: {
          mock: {
            failures: [
              { keys: ["订单交期-1101"], type: "TIMEOUT", times: 1 },
              { keys: ["订单交期-1102"], type: "FORMAT_MISMATCH", times: 1, field: "ShipWindowEnd", message: "来源日期格式与目标不一致" },
            ],
          },
        },
        ownerId: tracker,
        lastTestAt: ctx.at(0, 1),
        lastTestOk: true,
        lastTestMessage: "模拟对端连接正常",
        createdBy: admin,
        createdAt: ctx.at(-55),
        updatedAt: ctx.at(-55),
      },
      {
        code: "MRN-PORTAL",
        name: "MRN Supplier Portal",
        kind: "CUSTOMER",
        customerId: ctx.customer("MRN"),
        protocol: "REST",
        baseUrl: "https://supplier-portal.mrn.example/api/v1",
        contact: "Morning Runner IT",
        ownerId: admin,
        note: "接口地址待客户开通，目前不可达",
        lastTestAt: ctx.at(-1, 10),
        lastTestOk: false,
        lastTestMessage: "无法连接对端：fetch failed",
        createdBy: admin,
        createdAt: ctx.at(-20),
        updatedAt: ctx.at(-20),
      },
    ])
    .returning();

  const [erpMap, nsrMap, mrnMap] = await db
    .insert(syncMappings)
    .values([
      {
        name: "环思款式主数据 → OTD",
        endpointId: erp!.id,
        object: "STYLE",
        direction: "PULL",
        keyField: "ITEM_NO",
        fields: ERP_STYLE_FIELDS,
        codeMaps: { customer: { C001: "NSR", C002: "MRN", C003: "BBY", C004: "MPT" }, season: { "2026AW": "AW26", "2026HO": "HO26", "2027SP": "SP27" } },
        createdBy: admin,
        createdAt: ctx.at(-60),
        updatedAt: ctx.at(-60),
      },
      {
        name: "NSR 订单交期映射",
        endpointId: nsr!.id,
        object: "ORDER_DUE",
        direction: "PUSH",
        fields: NSR_ORDER_FIELDS,
        codeMaps: { plant: { NH5: "SITE-NH5", DC1: "SITE-DC1", DC2: "SITE-DC2", HP3: "SITE-HP3" }, size: { S: "01", M: "02", L: "03" } },
        createdBy: tracker,
        createdAt: ctx.at(-55),
        updatedAt: ctx.at(-30),
        version: 2,
      },
      {
        name: "MRN 测试报告回传映射",
        endpointId: mrn!.id,
        object: "TEST_REPORT",
        direction: "PUSH",
        fields: MRN_REPORT_FIELDS,
        codeMaps: {},
        createdBy: admin,
        createdAt: ctx.at(-20),
        updatedAt: ctx.at(-20),
      },
    ])
    .returning();

  const mainRunAt = new Date(Math.floor((now - 3 * 60 * MIN) / MIN) * MIN);
  const docs = [await ctx.docNo("syncTask"), await ctx.docNo("syncTask"), await ctx.docNo("syncTask"), await ctx.docNo("syncTask"), await ctx.docNo("syncTask")];

  const tasks = await db
    .insert(syncTasks)
    .values([
      {
        docNo: docs[0]!,
        name: "环思 ERP 款式主数据同步（环思 ERP → OTD 平台）",
        endpointId: erp!.id,
        mappingId: erpMap!.id,
        object: "STYLE",
        direction: "PULL",
        mode: "INCREMENTAL",
        trigger: "SCHEDULED",
        intervalMinutes: 60,
        frequency: "每小时",
        ownerId: planner,
        lastRunAt: new Date(now - 40 * MIN),
        nextRunAt: new Date(now + 20 * MIN),
        lastStatus: "SUCCESS",
        watermark: ctx.at(0, 1).toISOString(),
        createdBy: admin,
        createdAt: ctx.at(-60),
        updatedAt: ctx.at(-60),
      },
      {
        docNo: docs[1]!,
        name: "订单回写环思 ERP（OTD 平台 → 环思 ERP）",
        endpointId: erp!.id,
        object: "ORDER_DUE",
        direction: "PUSH",
        mode: "INCREMENTAL",
        trigger: "SCHEDULED",
        intervalMinutes: 30,
        frequency: "每 30 分钟",
        ownerId: planner,
        lastRunAt: new Date(now - 20 * MIN),
        nextRunAt: new Date(now + 10 * MIN),
        lastStatus: "SUCCESS",
        watermark: new Date(now - 20 * MIN).toISOString(),
        createdBy: admin,
        createdAt: ctx.at(-60),
        updatedAt: ctx.at(-60),
      },
      {
        docNo: docs[2]!,
        name: "NSR 订单交期同步（OTD 平台 → 客户系统）",
        endpointId: nsr!.id,
        mappingId: nsrMap!.id,
        customerId: ctx.customer("NSR"),
        object: "ORDER_DUE",
        direction: "PUSH",
        mode: "INCREMENTAL",
        trigger: "SCHEDULED",
        intervalMinutes: 720,
        frequency: "每半天一次",
        ownerId: tracker,
        lastRunAt: mainRunAt,
        nextRunAt: new Date(mainRunAt.getTime() + 720 * MIN),
        lastStatus: "PARTIAL",
        watermark: mainRunAt.toISOString(),
        note: "少量记录因编码映射未命中失败，已进重试队列。",
        createdBy: tracker,
        createdAt: ctx.at(-55),
        updatedAt: ctx.at(-30),
        version: 2,
      },
      {
        docNo: docs[3]!,
        name: "NSR TNA 节点同步（OTD 平台 → 客户系统）",
        endpointId: nsr!.id,
        customerId: ctx.customer("NSR"),
        object: "TNA",
        direction: "PUSH",
        mode: "INCREMENTAL",
        trigger: "EVENT",
        frequency: "事件触发",
        ownerId: tracker,
        lastRunAt: ctx.at(-1, 14),
        lastStatus: "SUCCESS",
        watermark: ctx.at(-1, 14).toISOString(),
        createdBy: tracker,
        createdAt: ctx.at(-40),
        updatedAt: ctx.at(-40),
      },
      {
        docNo: docs[4]!,
        name: "MRN 测试报告回传（OTD 平台 → MRN Supplier Portal）",
        endpointId: mrn!.id,
        mappingId: mrnMap!.id,
        customerId: ctx.customer("MRN"),
        object: "TEST_REPORT",
        direction: "PUSH",
        mode: "FULL",
        trigger: "MANUAL",
        ownerId: admin,
        lastRunAt: ctx.at(-1, 10),
        lastStatus: "FAILED",
        note: "客户接口未开通，连接失败的记录已转人工",
        createdBy: admin,
        createdAt: ctx.at(-20),
        updatedAt: ctx.at(-20),
      },
    ])
    .returning();
  const [erpStyle, erpOrders, nsrDue, nsrTna, mrnReports] = tasks;

  const runAt = (taskId: string, trigger: string, startedAt: Date, minutes: number, status: string, c: { total: number; success: number; failed: number; skipped: number }, operatorId: string | null = null) => {
    const finishedAt = new Date(startedAt.getTime() + minutes * MIN);
    return {
      taskId,
      trigger,
      startedAt,
      finishedAt,
      durationMs: minutes * MIN,
      status,
      ...c,
      operatorId,
      steps: steps(startedAt, finishedAt, status !== "FAILED", `成功 ${c.success} 条，失败 ${c.failed} 条，跳过 ${c.skipped} 条`),
    };
  };

  const runs = await db
    .insert(syncRuns)
    .values([
      runAt(erpStyle!.id, "SCHEDULED", new Date(now - 40 * MIN), 1, "SUCCESS", { total: 120, success: 120, failed: 0, skipped: 0 }),
      runAt(erpOrders!.id, "SCHEDULED", new Date(now - 20 * MIN), 1, "SUCCESS", { total: 8, success: 8, failed: 0, skipped: 0 }),
      runAt(nsrDue!.id, "SCHEDULED", new Date(mainRunAt.getTime() - 720 * MIN), 6, "SUCCESS", { total: 1116, success: 1116, failed: 0, skipped: 0 }),
      runAt(nsrDue!.id, "SCHEDULED", mainRunAt, 9, "PARTIAL", { total: 1492, success: 1490, failed: 2, skipped: 0 }),
      runAt(nsrTna!.id, "EVENT", ctx.at(-1, 14), 1, "SUCCESS", { total: 1, success: 1, failed: 0, skipped: 0 }),
      runAt(mrnReports!.id, "MANUAL", ctx.at(-1, 10), 1, "FAILED", { total: 2, success: 0, failed: 2, skipped: 0 }, admin),
    ])
    .returning();
  const [erpStyleRun, erpOrdersRun, nsrPrevRun, nsrRun, nsrTnaRun, mrnRun] = runs;

  const batch = (runId: string, batchNo: string, object: string, startedAt: Date, durationMs: number, total: number, failed: number) => ({
    runId,
    batchNo,
    object,
    startedAt,
    durationMs,
    total,
    success: total - failed,
    failed,
    skipped: 0,
    status: failed === 0 ? "SUCCESS" : failed === total ? "FAILED" : "PARTIAL",
  });
  const batches = await db
    .insert(syncBatches)
    .values([
      batch(erpStyleRun!.id, "B01", "STYLE", erpStyleRun!.startedAt, 42_000, 120, 0),
      batch(erpOrdersRun!.id, "B01", "ORDER_DUE", erpOrdersRun!.startedAt, 6_000, 8, 0),
      ...[0, 1, 2].map((i) => batch(nsrPrevRun!.id, `B0${i + 1}`, "ORDER_DUE", new Date(nsrPrevRun!.startedAt.getTime() + (i + 1) * 2 * MIN), 74_000, 372, 0)),
      ...[0, 1, 2, 3].map((i) => batch(nsrRun!.id, `B0${i + 1}`, "ORDER_DUE", new Date(mainRunAt.getTime() + (i + 1) * 2 * MIN), 77_000, 373, i === 3 ? 2 : 0)),
      batch(nsrTnaRun!.id, "B01", "TNA", nsrTnaRun!.startedAt, 1_200, 1, 0),
      batch(mrnRun!.id, "B01", "TEST_REPORT", mrnRun!.startedAt, 30_500, 2, 2),
    ])
    .returning();
  const b04 = batches.find((b) => b.runId === nsrRun!.id && b.batchNo === "B04")!;
  const mrnBatch = batches.find((b) => b.runId === mrnRun!.id)!;

  const orderPayload = (poNo: string, dueOffset: number, replyOffset: number, pairs: number) => ({
    poNo,
    customerCode: "NSR",
    customerDueDate: ctx.day(dueOffset),
    factoryReplyDate: ctx.day(replyOffset),
    factoryCode: "NH5",
    totalPairs: pairs,
    seasonCode: "AW26",
    status: "IN_PRODUCTION",
  });
  const failedAt = new Date(mainRunAt.getTime() + 9 * MIN);
  await db.insert(syncRecords).values([
    {
      taskId: nsrDue!.id,
      runId: nsrRun!.id,
      batchId: b04.id,
      recordKey: "订单交期-1101",
      field: null,
      errorType: "TIMEOUT",
      errorMessage: "外部系统 30 秒内未返回结果",
      suggestion: "链路重试；连续超时需联系对方系统运维",
      payload: orderPayload("PO0011101", 38, 36, 3720),
      status: "RETRYING",
      attempts: 1,
      nextRetryAt: new Date(now + MIN),
      updatedAt: failedAt,
    },
    {
      taskId: nsrDue!.id,
      runId: nsrRun!.id,
      batchId: b04.id,
      recordKey: "订单交期-1102",
      field: "ShipWindowEnd",
      errorType: "FORMAT_MISMATCH",
      errorMessage: "来源日期格式与目标不一致",
      suggestion: "在转换规则里统一为 YYYY-MM-DD",
      payload: orderPayload("PO0011102", 45, 44, 2160),
      status: "FAILED",
      attempts: 1,
      updatedAt: failedAt,
    },
    ...["测试报告-2201", "测试报告-2202"].map((recordKey, i) => ({
      taskId: mrnReports!.id,
      runId: mrnRun!.id,
      batchId: mrnBatch.id,
      recordKey,
      field: null,
      errorType: "CONNECTION_FAILED",
      errorMessage: "无法连接对端：fetch failed",
      suggestion: "检查对端地址与网络后重试",
      payload: { docNo: recordKey, agencyReportNo: `BV-26-1052${i + 3}`, customerCode: "MRN", styleNo: "11151", result: "PASS", issuedDate: ctx.day(-12), validUntil: ctx.day(353) },
      status: "FAILED",
      attempts: 6,
      updatedAt: new Date(ctx.at(-1, 10).getTime() + 31 * MIN),
    })),
  ]);

  const log = (task: (typeof tasks)[number], at: Date, userId: string | null, action: string, diff: Record<string, unknown>) => ({
    at,
    userId,
    userName: userId ? (names.get(userId) ?? null) : "system",
    action,
    objectType: "syncTask",
    objectId: task.id,
    docNo: task.docNo,
    diff,
  });
  await db.insert(auditLogs).values([
    log(erpStyle!, ctx.at(-60, 10), admin, "sync.task.create", { name: erpStyle!.name, object: "STYLE", direction: "PULL" }),
    log(erpOrders!, ctx.at(-60, 10), admin, "sync.task.create", { name: erpOrders!.name, object: "ORDER_DUE", direction: "PUSH" }),
    log(nsrDue!, ctx.at(-55, 10), tracker, "sync.task.create", { name: nsrDue!.name, object: "ORDER_DUE", direction: "PUSH" }),
    log(nsrDue!, ctx.at(-30, 15), tracker, "sync.task.update", { intervalMinutes: { from: 1440, to: 720 }, frequency: { from: "每天一次", to: "每半天一次" } }),
    log(nsrDue!, nsrPrevRun!.startedAt, null, "sync.task.run", { trigger: "SCHEDULED", runId: nsrPrevRun!.id }),
    log(nsrDue!, nsrPrevRun!.finishedAt!, null, "sync.run.finish", { runId: nsrPrevRun!.id, status: "SUCCESS", total: 1116, success: 1116, failed: 0, skipped: 0, error: null }),
    log(nsrDue!, mainRunAt, null, "sync.task.run", { trigger: "SCHEDULED", runId: nsrRun!.id }),
    log(nsrDue!, nsrRun!.finishedAt!, null, "sync.run.finish", { runId: nsrRun!.id, status: "PARTIAL", total: 1492, success: 1490, failed: 2, skipped: 0, error: null }),
    log(nsrTna!, ctx.at(-40, 11), tracker, "sync.task.create", { name: nsrTna!.name, object: "TNA", direction: "PUSH" }),
    log(nsrTna!, ctx.at(-1, 14), null, "sync.task.run", { trigger: "EVENT", runId: nsrTnaRun!.id }),
    log(nsrTna!, nsrTnaRun!.finishedAt!, null, "sync.run.finish", { runId: nsrTnaRun!.id, status: "SUCCESS", total: 1, success: 1, failed: 0, skipped: 0, error: null }),
    log(mrnReports!, ctx.at(-20, 10), admin, "sync.task.create", { name: mrnReports!.name, object: "TEST_REPORT", direction: "PUSH" }),
    log(mrnReports!, ctx.at(-1, 10), admin, "sync.task.run", { trigger: "MANUAL", runId: mrnRun!.id }),
    log(mrnReports!, mrnRun!.finishedAt!, admin, "sync.run.finish", { runId: mrnRun!.id, status: "FAILED", total: 2, success: 0, failed: 2, skipped: 0, error: null }),
    log(mrnReports!, new Date(ctx.at(-1, 10).getTime() + 31 * MIN), null, "sync.record.abandon", { count: 2, keys: ["测试报告-2201", "测试报告-2202"] }),
  ]);
}
