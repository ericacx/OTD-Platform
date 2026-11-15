import { DEFAULT_FLOW_PARAMS } from "@otd/contracts/flow";
import { HttpResponse, http } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  FlowCardDto,
  FlowDetailDto,
  FlowDiffDto,
  FlowModuleView,
  MigrationPreviewDto,
  RulePackDto,
  ServiceItemDto,
  ServiceModuleDto,
} from "@otd/contracts/flow";
import type { HttpHandler } from "msw";

type CatalogModule = {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  department: string;
  hasPage: boolean;
  nodes: string[];
  items: [string, string[]?][];
};

const CATALOG: CatalogModule[] = [
  {
    id: "m-01",
    code: "SM01",
    name: "企划与开发",
    nameEn: "Briefs & development",
    department: "业务部",
    hasPage: true,
    nodes: ["N01"],
    items: [["企划接入"], ["技术资料 / 工艺单"], ["企划复核"]],
  },
  {
    id: "m-02",
    code: "SM02",
    name: "报价与定价",
    nameEn: "Quotation & pricing",
    department: "业务部",
    hasPage: true,
    nodes: ["N04"],
    items: [["成本核算"], ["季节价格汇总"]],
  },
  {
    id: "m-03",
    code: "SM03",
    name: "打样开发",
    nameEn: "Sampling",
    department: "技术部",
    hasPage: true,
    nodes: ["N02"],
    items: [["颜色样"], ["产前样"], ["QRS 品质参考样", ["G1.qrsRetained"]]],
  },
  {
    id: "m-05",
    code: "SM05",
    name: "测试服务",
    nameEn: "Testing",
    department: "品质部",
    hasPage: true,
    nodes: ["N03"],
    items: [["色牢度"], ["pH 值"], ["圆率测试"], ["报告复用管理", ["G1.testReportValid", "G2.reportsValid"]]],
  },
  {
    id: "m-06",
    code: "SM06",
    name: "验货服务",
    nameEn: "Inspection",
    department: "品质部",
    hasPage: true,
    nodes: ["N09"],
    items: [["初期验货 IPI"], ["尾期验货 FRI", ["G2.finalPassed"]]],
  },
  {
    id: "m-07",
    code: "SM07",
    name: "包装服务",
    nameEn: "Packing",
    department: "生产部",
    hasPage: true,
    nodes: ["N07"],
    items: [["包装方案确认", ["G2.packingReady"]], ["船样确认"]],
  },
  {
    id: "m-13",
    code: "SM13",
    name: "TNA 与预警管理",
    nameEn: "TNA & alerts",
    department: "计划部",
    hasPage: false,
    nodes: [],
    items: [["TNA 模板"], ["节点预警"]],
  },
];

function catalogItems(m: CatalogModule): ServiceItemDto[] {
  return m.items.map(([name, gates], i) => ({
    id: `${m.id}-i${i + 1}`,
    moduleId: m.id,
    moduleCode: m.code,
    code: `${m.code}-${String(i + 1).padStart(2, "0")}`,
    name,
    nameEn: null,
    description: null,
    department: null,
    requiresCustomerConfirm: false,
    effects: { nodes: m.nodes, gateConditions: gates ?? [] },
    paramsSchema: null,
    sort: i + 1,
    version: 1,
  }));
}

const mockServiceModules: ServiceModuleDto[] = CATALOG.map((m, i) => ({
  id: m.id,
  code: m.code,
  name: m.name,
  nameEn: m.nameEn,
  department: m.department,
  sort: i + 1,
  hasPage: m.hasPage,
  description: null,
  nodes: m.nodes,
  itemCount: m.items.length,
  customerCount: m.hasPage ? 6 : null,
  enabledItemTotal: m.hasPage ? m.items.length * 5 : null,
  version: 1,
}));

type DraftState = {
  modules: { moduleCode: string; department: string; items: string[] }[];
  params: Record<string, unknown>;
  version: number;
};

const PUBLISHED: DraftState["modules"] = CATALOG.filter((m) => m.hasPage).map((m) => ({
  moduleCode: m.code,
  department: m.department,
  items: catalogItems(m)
    .filter((i) => i.name !== "圆率测试" && i.name !== "船样确认")
    .map((i) => i.code),
}));

function initialDraft(): DraftState {
  return {
    modules: PUBLISHED.map((m) => ({ ...m, items: [...m.items] })),
    params: { ...DEFAULT_FLOW_PARAMS, sameFactorySameDayLimit: 4 },
    version: 3,
  };
}

let nsrDraft = initialDraft();

export function resetFlowMocks() {
  nsrDraft = initialDraft();
}

function moduleViews(state: DraftState): FlowModuleView[] {
  return state.modules.map((m, idx) => {
    const cat = CATALOG.find((c) => c.code === m.moduleCode)!;
    const items = catalogItems(cat);
    return {
      moduleId: cat.id,
      moduleCode: m.moduleCode,
      name: cat.name,
      nameEn: cat.nameEn,
      department: m.department,
      defaultDepartment: cat.department,
      hasPage: cat.hasPage,
      sort: idx + 1,
      nodes: m.items.length ? cat.nodes : [],
      items: items.map((i) => ({
        code: i.code,
        name: i.name,
        nameEn: null,
        enabled: m.items.includes(i.code),
        params: null,
        requiresCustomerConfirm: false,
        deleted: false,
      })),
      enabledCount: m.items.length,
      totalCount: items.length,
    };
  });
}

function draftNodes(state: DraftState): string[] {
  const nodes = new Set(
    state.modules.filter((m) => m.items.length).flatMap((m) => CATALOG.find((c) => c.code === m.moduleCode)!.nodes),
  );
  nodes.add("N05");
  nodes.add("N06");
  nodes.add("N08");
  nodes.add("N09");
  nodes.add("N10");
  return ["N01", "N02", "N03", "N04", "N05", "N06", "N07", "N08", "N09", "N10"].filter((n) => nodes.has(n));
}

function hasChanges(state: DraftState): boolean {
  return (
    JSON.stringify(state.modules) !== JSON.stringify(PUBLISHED) ||
    state.params.sameFactorySameDayLimit !== DEFAULT_FLOW_PARAMS.sameFactorySameDayLimit
  );
}

const CARDS: FlowCardDto[] = [
  ["c-nsr", "NSR", "北岸运动", "NORTHSHORE", "Milena Ortiz", 60],
  ["c-mpt", "MPT", "枫林户外", "MAPLE TRAIL", "Pierre Laurent", 45],
  ["c-bby", "BBY", "蓝湾生活", "BLUEBAY", "李潇", 30],
].map(([customerId, code, name, logoText, contactName, terms]) => ({
  customerId: customerId as string,
  code: code as string,
  name: name as string,
  nameEn: null,
  logoText: logoText as string,
  contactName: contactName as string,
  paymentTermsDays: terms as number,
  customerStatus: "ACTIVE",
  flowStatus: code === "NSR" ? "DRAFT" : "PUBLISHED",
  hasChanges: code === "NSR",
  moduleCount: code === "BBY" ? 5 : 6,
  itemCount: code === "BBY" ? 12 : 14,
  currentVersionNo: 1,
  publishedAt: "2026-09-06T02:00:00.000Z",
}));

function card(customerId: string): FlowCardDto {
  const base = CARDS.find((c) => c.customerId === customerId) ?? CARDS[0]!;
  if (base.customerId !== "c-nsr") return base;
  const changed = hasChanges(nsrDraft);
  return { ...base, hasChanges: changed, flowStatus: changed ? "DRAFT" : "PUBLISHED" };
}

function detail(customerId: string): FlowDetailDto {
  const views = moduleViews(nsrDraft);
  const inDraft = new Set(nsrDraft.modules.map((m) => m.moduleCode));
  return {
    customer: card(customerId),
    draft: { modules: views, params: nsrDraft.params },
    draftRuntime: {
      customerId,
      versionId: null,
      versionNo: null,
      configured: false,
      nodes: draftNodes(nsrDraft),
      gateConditions: {
        G1: ["sampleApproved", "quoteAccepted", "testReportValid", "qrsRetained", "techPackUploaded"],
        G2: ["finalPassed", "reportsValid", "packingReady"],
      },
      modules: nsrDraft.modules.map((m) => m.moduleCode),
      items: nsrDraft.modules.flatMap((m) => m.items),
      params: nsrDraft.params,
    },
    availableModules: CATALOG.filter((m) => m.hasPage && !inDraft.has(m.code)).map((m) => ({
      moduleCode: m.code,
      name: m.name,
      nameEn: m.nameEn,
      department: m.department,
      itemCount: m.items.length,
    })),
    currentVersion: {
      id: "v-nsr-1",
      versionNo: 1,
      note: "初始流程配置",
      publishedAt: "2026-09-06T02:00:00.000Z",
      publishedBy: "u-admin",
      publishedByName: "管理员",
      moduleCount: PUBLISHED.length,
      itemCount: PUBLISHED.reduce((n, m) => n + m.items.length, 0),
      isCurrent: true,
      summary: null,
    },
    hasChanges: hasChanges(nsrDraft),
    version: nsrDraft.version,
  };
}

const EMPTY_DIFF: Omit<FlowDiffDto, "identical"> = {
  from: { label: "v1", versionId: "v-nsr-1", versionNo: 1 },
  to: { label: "draft", versionId: null, versionNo: null },
  modulesAdded: [],
  modulesRemoved: [],
  orderChanged: false,
  order: { from: [], to: [] },
  departmentsChanged: [],
  itemsAdded: [],
  itemsRemoved: [],
  itemParamsChanged: [],
  paramsChanged: [],
  nodesAdded: [],
  nodesRemoved: [],
  gateConditionsAdded: [],
  gateConditionsRemoved: [],
};

function diff(): FlowDiffDto {
  const paramsChanged =
    nsrDraft.params.sameFactorySameDayLimit !== DEFAULT_FLOW_PARAMS.sameFactorySameDayLimit
      ? [
          {
            key: "sameFactorySameDayLimit",
            from: DEFAULT_FLOW_PARAMS.sameFactorySameDayLimit,
            to: nsrDraft.params.sameFactorySameDayLimit,
          },
        ]
      : [];
  const removed = PUBLISHED.filter((p) => !nsrDraft.modules.some((m) => m.moduleCode === p.moduleCode)).map((p) => ({
    moduleCode: p.moduleCode,
    name: CATALOG.find((c) => c.code === p.moduleCode)!.name,
  }));
  return { ...EMPTY_DIFF, identical: !hasChanges(nsrDraft), paramsChanged, modulesRemoved: removed };
}

const MIGRATION: MigrationPreviewDto = {
  target: { versionId: "v-nsr-2", versionNo: 2 },
  total: 1,
  orders: [
    {
      id: "o-1",
      poNo: "PO0010459",
      status: "IN_PRODUCTION",
      customerDueDate: "2026-12-01",
      fromVersionId: "v-nsr-1",
      fromVersionNo: 1,
      ownerName: "王芳",
    },
  ],
  groups: [
    {
      fromVersionId: "v-nsr-1",
      fromVersionNo: 1,
      orderCount: 1,
      diff: {
        ...EMPTY_DIFF,
        identical: false,
        nodesRemoved: ["N03"],
        to: { label: "v2", versionId: "v-nsr-2", versionNo: 2 },
      },
    },
  ],
};

const mockRulePacks: RulePackDto[] = [
  ["rp-1", "RP-PO_REVIEW", "PO_REVIEW", "PO 复核默认规则", null, { unitPriceTolerance: 0, quantityTolerancePct: 0 }],
  [
    "rp-2",
    "RP-RELEASE",
    "RELEASE",
    "验货放行默认规则",
    null,
    { releaseDaysBeforeExFactory: 15, sameFactorySameDayLimit: 6 },
  ],
  ["rp-3", "RP-RELEASE-NSR", "RELEASE", "北岸运动放行规则", "c-nsr", { sameFactorySameDayLimit: 5, mergeReport: true }],
].map(([id, code, kind, name, customerId, params]) => ({
  id: id as string,
  code: code as string,
  kind: kind as RulePackDto["kind"],
  name: name as string,
  nameEn: null,
  customerId: customerId as string | null,
  customerCode: customerId ? "NSR" : null,
  customerName: customerId ? "北岸运动" : null,
  params: params as Record<string, unknown>,
  description: null,
  enabled: true,
  updatedAt: "2026-10-01T02:00:00.000Z",
  version: 1,
}));

export const flowHandlers: HttpHandler[] = [
  http.get("*/flow/modules", ({ request }) =>
    HttpResponse.json(envelope(pageOf(mockServiceModules, new URL(request.url)))),
  ),
  http.get("*/flow/modules/:id", ({ params }) => {
    const m = CATALOG.find((c) => c.id === params.id);
    const dto = mockServiceModules.find((x) => x.id === params.id);
    return m && dto
      ? HttpResponse.json(envelope({ ...dto, items: catalogItems(m) }))
      : fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
  }),
  http.post("*/flow/modules/:id/assign", async ({ request }) => {
    const body = (await request.json()) as { customerIds: string[] };
    return HttpResponse.json(
      envelope({
        assigned: body.customerIds.map((id) => CARDS.find((c) => c.customerId === id)?.code ?? id),
        skipped: [],
      }),
    );
  }),
  http.get("*/flow/customers", ({ request }) =>
    HttpResponse.json(
      envelope(
        pageOf(
          CARDS.map((c) => card(c.customerId)),
          new URL(request.url),
        ),
      ),
    ),
  ),
  http.get("*/flow/customers/:customerId/diff", () => HttpResponse.json(envelope(diff()))),
  http.get("*/flow/customers/:customerId/versions", () =>
    HttpResponse.json(envelope([detail("c-nsr").currentVersion])),
  ),
  http.get("*/flow/customers/:customerId/migration", () => HttpResponse.json(envelope(MIGRATION))),
  http.get("*/flow/customers/:customerId", ({ params }) =>
    HttpResponse.json(envelope(detail(params.customerId as string))),
  ),
  http.put("*/flow/customers/:customerId/draft", async ({ params, request }) => {
    const body = (await request.json()) as {
      modules: { moduleCode: string; department?: string; items: { itemCode: string }[] }[];
      params: Record<string, unknown>;
      version: number;
    };
    if (body.version !== nsrDraft.version)
      return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    nsrDraft = {
      modules: body.modules.map((m) => ({
        moduleCode: m.moduleCode,
        department: m.department ?? CATALOG.find((c) => c.code === m.moduleCode)!.department,
        items: m.items.map((i) => i.itemCode),
      })),
      params: body.params,
      version: nsrDraft.version + 1,
    };
    return HttpResponse.json(envelope(detail(params.customerId as string)));
  }),
  http.post("*/flow/customers/:customerId/publish", async ({ params, request }) => {
    const body = (await request.json()) as { version: number };
    if (body.version !== nsrDraft.version)
      return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope(detail(params.customerId as string)));
  }),
  http.post("*/flow/customers/:customerId/migrate", () =>
    HttpResponse.json(envelope({ migrated: 1, orderIds: ["o-1"], target: MIGRATION.target })),
  ),
  http.post("*/flow/customers/:customerId/rollback", ({ params }) =>
    HttpResponse.json(envelope(detail(params.customerId as string))),
  ),
  http.post("*/flow/customers/:customerId/copy", ({ params }) =>
    HttpResponse.json(envelope(detail(params.customerId as string))),
  ),
  http.get("*/flow/rule-packs/effective", () => HttpResponse.json(envelope([]))),
  http.get("*/flow/rule-packs", ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    return HttpResponse.json(
      envelope(pageOf(kind ? mockRulePacks.filter((p) => p.kind === kind) : mockRulePacks, url)),
    );
  }),
  http.post("*/flow/rule-packs", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(envelope({ ...mockRulePacks[0]!, ...body, id: "rp-new", code: "RP-NEW", version: 1 }), {
      status: 201,
    });
  }),
  http.put("*/flow/rule-packs/:id", async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown> & { version?: number };
    const pack = mockRulePacks.find((p) => p.id === params.id);
    if (!pack) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (body.version !== pack.version) return fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);
    return HttpResponse.json(envelope({ ...pack, ...body, version: pack.version + 1 }));
  }),
  http.delete("*/flow/rule-packs/:id", ({ params }) => {
    const pack = mockRulePacks.find((p) => p.id === params.id);
    if (pack && pack.customerId === null) return fail("FLOW_RULEPACK_DEFAULT_LOCKED", "全局默认规则包不能删除", 409);
    return HttpResponse.json(envelope(null));
  }),
  http.get("*/flow/rule-packs/:id/snapshots", ({ params }) => {
    const pack = mockRulePacks.find((p) => p.id === params.id);
    if (!pack) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    return HttpResponse.json(
      envelope([
        {
          id: "snap-rp-2",
          objectVersion: 2,
          reason: "临时收紧",
          createdByName: "李强",
          createdAt: "2026-10-20T03:00:00.000Z",
        },
        {
          id: "snap-rp-1",
          objectVersion: 1,
          reason: "delete",
          createdByName: "管理员",
          createdAt: "2026-10-18T03:00:00.000Z",
        },
      ]),
    );
  }),
  http.post("*/flow/rule-packs/:id/rollback", async ({ params, request }) => {
    const pack = mockRulePacks.find((p) => p.id === params.id);
    if (!pack) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    const body = (await request.json()) as { snapshotId: string; reason: string };
    if (body.snapshotId === "snap-rp-2") {
      return HttpResponse.json(
        envelope({ ...pack, params: { sameFactorySameDayLimit: 5 }, version: pack.version + 1 }),
      );
    }
    return fail("FLOW_RULEPACK_SNAPSHOT_MISMATCH", "快照与规则包不匹配", 422);
  }),
  http.delete("*/flow/modules/:id", ({ params }) => {
    const mod = mockServiceModules.find((m) => m.id === params.id);
    if (!mod) return fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
    if (mod.id === "m-01" || mod.id === "m-03") {
      return fail("FLOW_CATALOG_IN_USE", `「${mod.name}」仍被 6 个客户流程使用，不能删除`, 409);
    }
    return HttpResponse.json(envelope(null));
  }),
];
