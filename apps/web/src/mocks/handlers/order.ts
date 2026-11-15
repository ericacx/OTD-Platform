import { NODES } from "@otd/shared";
import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type { MainlineDto, MainlineNode, MonitorDto, SearchResult } from "@otd/contracts/mainline";
import type {
  OrderDetail,
  OrderListItem,
  OrderStageDto,
  ProductionProgressDto,
  RuleCheckItemDto,
} from "@otd/contracts/order";

const TS = "2026-10-21T01:00:00.000Z";

const GREEN_RULES: RuleCheckItemDto[] = [
  {
    key: "stylesHandedOver",
    label: { zh: "款号均已完成开发移交", en: "All styles handed over" },
    passed: true,
    detail: "1 款均已移交",
  },
  {
    key: "quantityMatches",
    label: { zh: "明细数量合计等于总双数", en: "Line quantities match total pairs" },
    passed: true,
    detail: "明细合计 12,600 双，总双数 12,600 双",
  },
  {
    key: "leadTime",
    label: { zh: "客户交期不早于下单日 + 30 天", en: "Due date at least 30 days after order date" },
    passed: true,
    detail: "下单日 2026-09-04，客户交期 2026-11-03，相差 60 天",
  },
  {
    key: "priceMatchesQuote",
    label: { zh: "单价与已接受报价偏差不超过 3%", en: "Unit price within 3% of accepted quote" },
    passed: true,
    detail: "单价与已接受报价一致",
  },
  { key: "factoryAssigned", label: { zh: "承做工厂已指定", en: "Factory assigned" }, passed: true },
];

const RED_RULES: RuleCheckItemDto[] = GREEN_RULES.map((r) =>
  r.key === "stylesHandedOver" ? { ...r, passed: false, detail: "未完成开发移交：#12810" } : r,
);

function stages(current: number, logs: Record<number, { action: string; at: string; by: string }[]>): OrderStageDto[] {
  const codes = ["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP", "COMPLETED"] as const;
  const avg = [5, 8, 40, 9, null];
  return codes.map((status, index) => ({
    status,
    state: index < current ? "DONE" : index === current ? "CURRENT" : "PENDING",
    enteredAt: logs[index]?.[0]?.at ?? null,
    leftAt: index < current ? (logs[index + 1]?.[0]?.at ?? null) : null,
    elapsedDays: index < current ? 5.1 : index === current ? 3.6 : null,
    avgDays: avg[index] ?? null,
    slowerThanAvg: false,
    logs: (logs[index] ?? []).map((l, j) => ({
      id: `log-${index}-${j}`,
      status,
      action: l.action,
      note: null,
      at: l.at,
      operatorName: l.by,
    })),
  }));
}

function detail(base: Partial<OrderDetail> & Pick<OrderDetail, "id" | "poNo">): OrderDetail {
  return {
    revision: 1,
    customerId: "c-nsr",
    customerName: "北岸运动",
    seasonCode: "AW26",
    styleNos: ["11506", "12810"],
    styleCount: 2,
    totalPairs: 37080,
    fobAmount: 34299,
    currency: "USD",
    customerDueDate: "2026-12-16",
    factoryReplyDate: null,
    delayDays: null,
    factoryId: "f-1",
    factoryName: "南湖五厂",
    merchandiserId: null,
    merchandiserName: "黄磊",
    ownerId: "u-sales",
    ownerName: "王芳",
    status: "PENDING_CONFIRM",
    currentNode: { code: "N06", name: { zh: "PO 复核", en: "PO review" }, state: "IN_PROGRESS" },
    createdAt: TS,
    version: 1,
    revisionDate: null,
    channel: "Retail",
    poType: "PDTN-SOCKS",
    productLine: "Performance",
    styleType: "老款新色",
    tradeTerm: "FOB Shanghai · Incoterms 2020",
    paymentTerms: "月结 60 天",
    buyerEntity: "NorthShore Sports Inc.",
    origin: "China",
    orderDate: "2026-10-17",
    factoryEntity: "OTD 针织南湖五厂",
    transportMode: "RAIL",
    destination: "Sète, FR",
    totalUnits: 6180,
    poTerms: "PO 号须出现在所有发票、出货文件与回执上。",
    note: null,
    sourceFileId: null,
    extraction: null,
    ruleCheck: RED_RULES,
    ruleCheckPassed: false,
    overrideReason: null,
    flowVersionId: null,
    confirmedAt: null,
    cancelledAt: null,
    cancelReason: null,
    customerConfirmedAt: null,
    customerConfirmMethod: null,
    dueDaysLeft: 56,
    lines: [
      {
        id: "l-1",
        styleId: "s-11506",
        styleNo: "11506",
        styleName: "晨雾罗纹中筒袜",
        color: "Black",
        size: "M",
        sku: "NSR-11506-BLK-M",
        quantity: 18540,
        unitPrice: 0.925,
        amount: 17149.5,
      },
      {
        id: "l-2",
        styleId: "s-12810",
        styleNo: "12810",
        styleName: "罗纹中筒休闲袜",
        color: "Black",
        size: "M",
        sku: "NSR-12810-BLK-M",
        quantity: 18540,
        unitPrice: 0.925,
        amount: 17149.5,
      },
    ],
    unmatchedLines: [],
    revisions: [],
    factoryReplies: [],
    stages: stages(0, {
      0: [{ action: "上传客户 PO 并识别字段，进入「待确认」", at: "2026-10-18T01:12:00.000Z", by: "系统识别" }],
    }),
    stageIndex: 1,
    stageLogCount: 1,
    production: [],
    nextStatus: "TO_SCHEDULE",
    updatedAt: TS,
    ...base,
  };
}

export const mockOrderDetails: OrderDetail[] = [
  detail({ id: "o-1", poNo: "PO0010459" }),
  detail({
    id: "o-2",
    poNo: "PO0009631",
    revision: 2,
    revisionDate: "2026-09-19",
    customerId: "c-mrn",
    customerName: "晨跑者",
    seasonCode: "HO26",
    styleNos: ["11151"],
    styleCount: 1,
    totalPairs: 12600,
    fobAmount: 23436,
    currency: "EUR",
    customerDueDate: "2026-11-03",
    factoryReplyDate: "2026-11-03",
    delayDays: 0,
    status: "IN_PRODUCTION",
    currentNode: { code: "N08", name: { zh: "备料与生产", en: "Materials & production" }, state: "IN_PROGRESS" },
    styleType: "新款",
    ruleCheck: GREEN_RULES,
    ruleCheckPassed: true,
    confirmedAt: "2026-09-09T02:00:00.000Z",
    customerConfirmedAt: "2026-09-08T07:00:00.000Z",
    customerConfirmMethod: "EMAIL",
    dueDaysLeft: 13,
    lines: [
      {
        id: "l-3",
        styleId: "s-11151",
        styleNo: "11151",
        styleName: "美丽诺像素提花中筒袜",
        color: "Black",
        size: "L",
        sku: "MRN-11151-BLK-L",
        quantity: 12600,
        unitPrice: 1.86,
        amount: 23436,
      },
    ],
    revisions: [
      {
        id: "rv-1",
        revision: 1,
        snapshot: { customerDueDate: "2026-11-03", totalPairs: 12000, lines: [{}] },
        note: "客户追加 600 双（Rev.2）",
        createdBy: "u-sales",
        createdByName: "王芳",
        createdAt: "2026-09-19T06:00:00.000Z",
      },
    ],
    factoryReplies: [
      {
        id: "fr-2",
        versionNo: 2,
        replyDate: "2026-11-03",
        delayDays: 0,
        note: null,
        createdByName: "黄磊",
        createdAt: "2026-09-13T03:00:00.000Z",
      },
      {
        id: "fr-1",
        versionNo: 1,
        replyDate: "2026-11-08",
        delayDays: 5,
        note: "染色排队，申请延期",
        createdByName: "黄磊",
        createdAt: "2026-09-10T03:00:00.000Z",
      },
    ],
    stages: stages(2, {
      0: [{ action: "上传客户 PO 并识别字段，进入「待确认」", at: "2026-09-04T01:00:00.000Z", by: "系统识别" }],
      1: [{ action: "PO 复核规则包全绿，确认订单，进入「待排产」", at: "2026-09-09T02:00:00.000Z", by: "王芳" }],
      2: [{ action: "排产确认，进入「生产中」", at: "2026-09-15T01:00:00.000Z", by: "孙悦" }],
    }),
    stageIndex: 3,
    stageLogCount: 3,
    production: [
      {
        id: "pp-1",
        reportDate: "2026-10-19",
        knittedPairs: 1512,
        packedPairs: 0,
        completionRate: 0.12,
        note: null,
        createdAt: TS,
      },
    ],
    nextStatus: "TO_SHIP",
  }),
];

function listItem(d: OrderDetail): OrderListItem {
  const {
    id,
    poNo,
    revision,
    customerId,
    customerName,
    seasonCode,
    styleNos,
    styleCount,
    totalPairs,
    fobAmount,
    currency,
    customerDueDate,
    factoryReplyDate,
    delayDays,
    factoryId,
    factoryName,
    merchandiserId,
    merchandiserName,
    ownerId,
    ownerName,
    status,
    currentNode,
    createdAt,
    version,
  } = d;
  return {
    id,
    poNo,
    revision,
    customerId,
    customerName,
    seasonCode,
    styleNos,
    styleCount,
    totalPairs,
    fobAmount,
    currency,
    customerDueDate,
    factoryReplyDate,
    delayDays,
    factoryId,
    factoryName,
    merchandiserId,
    merchandiserName,
    ownerId,
    ownerName,
    status,
    currentNode,
    createdAt,
    version,
  };
}

const SUMMARIES: [MainlineNode["state"], string][] = [
  ["DONE", "AW26 企划 BR-2610-003 已确认（#11506）"],
  ["DONE", "打样已批准（SP-2610-012 第 2 轮 SMS），按客户规则口径归档"],
  ["DONE", "测试报告 BV-26-10523 有效至 2027-12-05，报告复用自动核验"],
  ["DONE", "报价 QT-11506-04 已被客户接受"],
  ["DONE", "五项齐套：样品 + 报价 + 测试 + QRS + 技术资料包，DH-2610-001 已移交冻结"],
  ["BLOCKED", "PO PO0010459 待复核 · 规则包有 1 项未通过"],
  ["NOT_STARTED", "物料清单展开用料需求 · 包装通知单待确认"],
  ["NOT_STARTED", "南湖五厂承做 · 生产排程与在制任务在此跟进"],
  ["NOT_STARTED", "初验 / 中验 / 尾验按计划执行；三条件缺一不放行"],
  ["NOT_STARTED", "中欧班列 · 订舱、出运与收款在此闭环"],
];

export const mockMainline: MainlineDto = {
  orderId: "o-1",
  poNo: "PO0010459",
  nodes: NODES.map((n, index) => {
    const [state, zh] = SUMMARIES[index]!;
    return {
      code: n.code,
      key: n.key,
      name: n.label,
      gate: "gate" in n ? n.gate : null,
      state,
      summary: { zh, en: zh },
      blockedReasons:
        state === "BLOCKED"
          ? [{ zh: "款号均已完成开发移交：未完成开发移交：#12810", en: "All styles handed over: #12810 pending" }]
          : [],
      link: index === 5 ? "/orders/o-1" : null,
      parallel: false,
      styles:
        index < 5
          ? [
              { styleNo: "11506", state: "DONE" },
              { styleNo: "12810", state: "DONE" },
            ]
          : [],
      enteredAt: state === "NOT_STARTED" ? null : TS,
      completedAt: state === "DONE" ? TS : null,
    };
  }),
  completedCount: 5,
  total: 10,
  currentNode: "N06",
  closed: false,
  headline: { zh: "已完成 5 / 10 步 · 当前节点：PO 复核", en: "Done 5 / 10 · current: PO review" },
  computedAt: TS,
};

export const mockSearch: SearchResult[] = [
  { type: "order", id: "o-1", docNo: "PO0010459", title: "PO0010459 · 北岸运动 · 37,080 双", link: "/orders/o-1" },
  { type: "order", id: "o-2", docNo: "PO0009631", title: "PO0009631 · 晨跑者 · 12,600 双", link: "/orders/o-2" },
  {
    type: "style",
    id: "s-11506",
    docNo: "11506",
    title: "#11506 晨雾罗纹中筒袜 · AW26",
    link: "/orders?keyword=11506",
  },
  {
    type: "inspection",
    id: "i-1",
    docNo: "INSP-2610-020",
    title: "INSP-2610-020 · 验货 FRI",
    link: "/inspections/i-1",
  },
];

function findOrder(id: string | readonly string[] | undefined) {
  return mockOrderDetails.find((o) => o.id === id);
}

function bumped(order: OrderDetail, patch: Partial<OrderDetail>): OrderDetail {
  return { ...order, ...patch, version: order.version + 1 };
}

const NEXT: Record<string, OrderDetail["status"] | null> = {
  TO_SCHEDULE: "IN_PRODUCTION",
  IN_PRODUCTION: "TO_SHIP",
  TO_SHIP: "COMPLETED",
  COMPLETED: null,
};

export const orderHandlers = [
  http.get("*/orders/monitor", ({ request }) => {
    const poNo = new URL(request.url).searchParams.get("poNo")?.toUpperCase();
    const order = mockOrderDetails.find((o) => o.poNo === poNo);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const monitor: MonitorDto = {
      order: {
        id: order.id,
        poNo: order.poNo,
        customerId: order.customerId,
        customerName: order.customerName,
        seasonCode: order.seasonCode,
        styleNos: order.styleNos,
        styleSummary: `#${order.styleNos[0]}`,
        totalPairs: order.totalPairs,
        customerDueDate: order.customerDueDate,
        factoryName: order.factoryName,
        status: order.status,
      },
      mainline: { ...mockMainline, orderId: order.id, poNo: order.poNo },
    };
    return HttpResponse.json(envelope(monitor));
  }),
  http.get("*/orders/:id/mainline", ({ params }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    return HttpResponse.json(envelope({ ...mockMainline, orderId: order.id, poNo: order.poNo }));
  }),
  http.get("*/orders", ({ request }) => {
    const url = new URL(request.url);
    const statuses = url.searchParams.get("status")?.split(",").filter(Boolean) ?? [];
    const customerId = url.searchParams.get("customerId");
    const items = mockOrderDetails
      .filter((o) => !statuses.length || statuses.includes(o.status))
      .filter((o) => !customerId || o.customerId === customerId)
      .map(listItem);
    return HttpResponse.json(envelope(pageOf(items, url)));
  }),
  http.get("*/orders/:id", ({ params }) => {
    const order = findOrder(params.id);
    return order ? HttpResponse.json(envelope(order)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/orders/upload", async ({ request }) => {
    const body = (await request.json()) as { fileId?: string; customerId?: string };
    if (!body.fileId) return fail("COMMON_VALIDATION_FAILED", "请求参数校验失败", 422);
    const created = detail({
      id: "o-new",
      poNo: "PO0090001",
      unmatchedLines: [{ styleNo: "T9999", color: "Navy", size: "L", sku: null, quantity: 600, unitPrice: 1.1 }],
      extraction: {
        poNo: { value: "PO0090001", confidence: 0.9 },
        dueDate: { value: "2026-12-20", confidence: 0, source: "默认值" },
      },
    });
    return HttpResponse.json(envelope(created), { status: 201 });
  }),
  http.post("*/orders", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const poNo = body.poNo as string;
    const customerId = body.customerId as string;
    const customerDueDate = body.customerDueDate as string;
    if (!customerId || !poNo || !customerDueDate || !Array.isArray(body.lines)) {
      return fail("COMMON_VALIDATION_FAILED", "请求参数校验失败", 422);
    }
    const lines = (body.lines as { styleId: string; quantity: number; unitPrice: number | null }[]).map((l, i) => ({
      id: `l-new-${i}`,
      styleId: l.styleId,
      styleNo: "12593",
      styleName: null,
      color: null,
      size: null,
      sku: null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.unitPrice === null ? null : l.quantity * l.unitPrice,
    }));
    const pairs = lines.reduce((sum, l) => sum + l.quantity, 0);
    const created = detail({
      id: "o-created",
      poNo,
      customerId,
      customerName: "北岸运动",
      currency: (body.currency as string) ?? "USD",
      customerDueDate,
      totalPairs: pairs,
      ruleCheck: GREEN_RULES,
      ruleCheckPassed: true,
      lines,
      unmatchedLines: [],
    });
    return HttpResponse.json(envelope(created), { status: 201 });
  }),
  http.put("*/orders/:id", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as Record<string, unknown> & { version: number };
    if (body.version !== order.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    if (order.status !== "PENDING_CONFIRM") {
      const keyTouched = ["customerDueDate", "currency", "tradeTerm", "paymentTerms", "lines"].some(
        (key) =>
          body[key] !== undefined &&
          JSON.stringify(body[key]) !== JSON.stringify((order as Record<string, unknown>)[key]),
      );
      if (keyTouched) return fail("ORDER_KEY_FIELD_LOCKED", "订单已确认，关键字段请走 PO 改版", 409);
    }
    const patch = { ...body } as Partial<OrderDetail>;
    delete patch.version;
    return HttpResponse.json(envelope(bumped(order, patch)));
  }),
  http.post("*/orders/:id/revise", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as Record<string, unknown> & { version: number; note?: string };
    if (body.version !== order.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const patch = { ...body } as Partial<OrderDetail> & { note?: string };
    delete patch.version;
    const note = patch.note;
    delete patch.note;
    const revision = {
      id: `rev-${order.revision + 1}`,
      revision: order.revision,
      snapshot: { customerDueDate: order.customerDueDate, totalPairs: order.totalPairs, lines: order.lines },
      note: note ?? null,
      createdBy: "u-1",
      createdByName: "王芳",
      createdAt: TS,
    };
    return HttpResponse.json(
      envelope(
        bumped(order, {
          ...(patch as Partial<OrderDetail>),
          revision: order.revision + 1,
          revisionDate: "2026-10-21",
          revisions: [revision, ...order.revisions],
        }),
      ),
    );
  }),
  http.post("*/orders/:id/confirm", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { version: number; overrideReason?: string };
    if (body.version !== order.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    const failed = (order.ruleCheck ?? []).filter((r) => !r.passed);
    if (failed.length && !body.overrideReason) {
      return fail("ORDER_RULE_PACK_FAILED", `PO 复核规则包未全绿：${failed.map((f) => f.label.zh).join("、")}`, 422, {
        failedRules: failed.map((f) => f.key),
      });
    }
    return HttpResponse.json(
      envelope(
        bumped(order, {
          status: "TO_SCHEDULE",
          overrideReason: body.overrideReason ?? null,
          nextStatus: "IN_PRODUCTION",
          stageIndex: 2,
        }),
      ),
    );
  }),
  http.post("*/orders/:id/advance", ({ params }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const next = NEXT[order.status];
    if (!next) return fail("FLOW_ILLEGAL_TRANSITION", "当前状态不允许执行该动作", 409);
    return HttpResponse.json(envelope(bumped(order, { status: next, nextStatus: NEXT[next] ?? null })));
  }),
  http.post("*/orders/:id/cancel", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { reason: string };
    return HttpResponse.json(
      envelope(bumped(order, { status: "CANCELLED", cancelReason: body.reason, cancelledAt: TS, nextStatus: null })),
    );
  }),
  http.post("*/orders/:id/factory-replies", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { replyDate: string; note?: string };
    const reply = {
      id: `fr-${order.factoryReplies.length + 1}`,
      versionNo: order.factoryReplies.length + 1,
      replyDate: body.replyDate,
      delayDays: 0,
      note: body.note ?? null,
      createdByName: "管理员",
      createdAt: TS,
    };
    return HttpResponse.json(
      envelope(
        bumped(order, {
          factoryReplyDate: body.replyDate,
          delayDays: 0,
          factoryReplies: [reply, ...order.factoryReplies],
        }),
      ),
    );
  }),
  http.post("*/orders/:id/customer-confirm", async ({ params, request }) => {
    const order = findOrder(params.id);
    if (!order) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { method: string };
    return HttpResponse.json(envelope(bumped(order, { customerConfirmedAt: TS, customerConfirmMethod: body.method })));
  }),
  http.post("*/orders/:id/rule-check", ({ params }) => {
    const order = findOrder(params.id);
    return order ? HttpResponse.json(envelope(order)) : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/orders/:id/production", async ({ request }) => {
    const body = (await request.json()) as { reportDate: string; knittedPairs: number; packedPairs: number };
    const row: ProductionProgressDto = {
      id: "pp-new",
      reportDate: body.reportDate,
      knittedPairs: body.knittedPairs,
      packedPairs: body.packedPairs,
      completionRate: 0.5,
      note: null,
      createdAt: TS,
    };
    return HttpResponse.json(envelope(row), { status: 201 });
  }),
  http.get("*/search", ({ request }) => {
    const q = (new URL(request.url).searchParams.get("q") ?? "").replace(/^#/, "").toUpperCase();
    return HttpResponse.json(
      envelope(mockSearch.filter((r) => r.docNo.toUpperCase().includes(q) || r.title.toUpperCase().includes(q))),
    );
  }),
];
