import type { Label } from "./label.js";
import type { ModuleCode, ModuleKey } from "./modules.js";
import type { PresetRole } from "./roles.js";

export type MenuAction = { code: string; label: Label };
export type MenuLeaf = { key: string; label: Label; path: string; permission: string; actions: MenuAction[] };
export type MenuGroup = {
  module: ModuleCode;
  moduleKey: ModuleKey;
  icon: string;
  label: Label;
  children: MenuLeaf[];
};

const a = (code: string, zh: string, en: string): MenuAction => ({ code, label: { zh, en } });

function leaf(path: string, permission: string, zh: string, en: string, actions: MenuAction[] = []): MenuLeaf {
  return { key: permission.replace(/\.view$|\.use$/, ""), label: { zh, en }, path, permission, actions };
}

const view = (resource: string, actionList: [string, string, string][]) =>
  actionList.map(([action, zh, en]) => a(`${resource}.${action}`, zh, en));

export const MENU: MenuGroup[] = [
  {
    module: "M00",
    moduleKey: "todo",
    icon: "list-checks",
    label: { zh: "今日待办", en: "Today" },
    children: [leaf("/todo", "todo.todo.view", "今日待办", "Today")],
  },
  {
    module: "M01",
    moduleKey: "assistant",
    icon: "bot",
    label: { zh: "智能助手", en: "Assistant" },
    children: [leaf("/assistant", "assistant.chat.use", "智能助手", "Assistant")],
  },
  {
    module: "M02",
    moduleKey: "planning",
    icon: "file-text",
    label: { zh: "企划管理", en: "Briefs" },
    children: [
      leaf("/planning", "planning.planning.view", "企划列表", "Briefs", view("planning.planning", [
        ["create", "导入企划", "Import"],
        ["edit", "编辑企划", "Edit"],
        ["confirm", "确认企划", "Confirm"],
        ["archive", "归档企划", "Archive"],
      ])),
      leaf("/planning/archived", "planning.archive.view", "归档列表", "Archived"),
    ],
  },
  {
    module: "M03",
    moduleKey: "sample",
    icon: "layers",
    label: { zh: "样品管理", en: "Samples" },
    children: [
      leaf("/samples/library", "sample.library.view", "样品库", "Sample library", view("sample.library", [["edit", "维护样品库", "Edit"]])),
      leaf("/samples", "sample.sample.view", "打样管理", "Sampling", view("sample.sample", [
        ["create", "下达打样", "Issue"],
        ["advance", "推进阶段", "Advance stage"],
        ["approve", "登记批复", "Record approval"],
      ])),
      leaf("/samples/materials", "sample.material.view", "备料登记", "Material prep", view("sample.material", [["edit", "登记备料", "Edit"]])),
    ],
  },
  {
    module: "M04",
    moduleKey: "quote",
    icon: "tag",
    label: { zh: "报价管理", en: "Quotation" },
    children: [
      leaf("/quotes", "quote.quote.view", "报价单管理", "Quotes", [
        ...view("quote.quote", [
          ["create", "新建报价", "New quote"],
          ["submit", "生成报价", "Submit"],
          ["feedback", "登记客户反馈", "Customer feedback"],
          ["archive", "归档报价单", "Archive"],
          ["override", "护栏例外审批", "Guardrail override"],
        ]),
        a("quote.cost.view", "查看成本与毛利", "View cost & margin"),
      ]),
      leaf("/quotes/strategies", "quote.strategy.view", "策略管理", "Strategies", view("quote.strategy", [["edit", "维护策略", "Edit"]])),
    ],
  },
  {
    module: "M05",
    moduleKey: "sampleship",
    icon: "send",
    label: { zh: "寄样管理", en: "Sample shipping" },
    children: [
      leaf("/sample-shipments", "sampleship.shipment.view", "寄样列表", "Shipments", view("sampleship.shipment", [
        ["create", "新建寄样", "New"],
        ["edit", "更新寄样", "Update"],
      ])),
      leaf("/sample-shipments/recipients", "sampleship.recipient.view", "收件人管理", "Recipients", view("sampleship.recipient", [["edit", "维护收件人", "Edit"]])),
    ],
  },
  {
    module: "M06",
    moduleKey: "testing",
    icon: "flask-conical",
    label: { zh: "测试管理", en: "Testing" },
    children: [
      leaf("/tests", "testing.request.view", "测试记录", "Test records", view("testing.request", [
        ["create", "发起测试", "New test"],
        ["advance", "推进送测", "Advance"],
        ["result", "登记结果", "Record result"],
      ])),
      leaf("/tests/reports", "testing.report.view", "报告管理", "Reports", view("testing.report", [["edit", "维护报告", "Edit"]])),
    ],
  },
  {
    module: "M07",
    moduleKey: "packaging",
    icon: "package",
    label: { zh: "包装管理", en: "Packing" },
    children: [
      leaf("/packaging", "packaging.plan.view", "包装方案", "Packing plans", view("packaging.plan", [
        ["create", "新建方案", "New"],
        ["edit", "修改方案", "Edit"],
        ["confirm", "确认包装方法", "Confirm"],
      ])),
      leaf("/packaging/cartons", "packaging.carton.view", "装箱管理", "Cartons", view("packaging.carton", [["edit", "维护装箱", "Edit"]])),
    ],
  },
  {
    module: "M08",
    moduleKey: "capacity",
    icon: "calendar-range",
    label: { zh: "计划管理", en: "Planning" },
    children: [
      leaf("/capacity", "capacity.ledger.view", "产能台账", "Capacity ledger", view("capacity.ledger", [
        ["edit", "维护台账", "Edit"],
        ["publish", "汇总集团总表", "Publish"],
      ])),
      leaf("/capacity/tasks", "capacity.task.view", "台账更新任务", "Ledger tasks", view("capacity.task", [["edit", "维护任务", "Edit"]])),
    ],
  },
  {
    module: "M09",
    moduleKey: "order",
    icon: "clipboard-list",
    label: { zh: "订单管理", en: "Orders" },
    children: [
      leaf("/orders", "order.order.view", "订单列表", "Orders", view("order.order", [
        ["create", "上传客户 PO", "Upload PO"],
        ["edit", "编辑订单", "Edit"],
        ["confirm", "复核确认", "Confirm"],
        ["advance", "推进阶段", "Advance"],
        ["cancel", "取消订单", "Cancel"],
        ["factoryReply", "登记工厂回复", "Factory reply"],
      ])),
      leaf("/orders/monitor", "order.monitor.view", "订单监控", "Order monitor"),
    ],
  },
  {
    module: "M10",
    moduleKey: "inspection",
    icon: "shield-check",
    label: { zh: "验货管理", en: "Inspection" },
    children: [
      leaf("/inspections", "inspection.inspection.view", "验货记录", "Inspections", view("inspection.inspection", [
        ["create", "申请验货", "Request"],
        ["result", "登记结果", "Record result"],
        ["rework", "整改复验", "Rework"],
        ["release", "登记放行", "Release"],
        ["cancel", "取消验货", "Cancel"],
      ])),
      leaf("/inspections/schedule", "inspection.schedule.view", "验货排期", "Schedule", view("inspection.schedule", [["edit", "排期", "Schedule"]])),
    ],
  },
  {
    module: "M11",
    moduleKey: "shipment",
    icon: "truck",
    label: { zh: "出货管理", en: "Shipping" },
    children: [
      leaf("/shipments", "shipment.shipment.view", "出货明细", "Shipments", view("shipment.shipment", [
        ["create", "新建出货", "New"],
        ["advance", "更新物流节点", "Advance"],
        ["sign", "登记签收", "Record POD"],
      ])),
      leaf("/shipments/bookings", "shipment.booking.view", "订舱管理", "Bookings", view("shipment.booking", [["edit", "维护订舱", "Edit"]])),
    ],
  },
  {
    module: "M12",
    moduleKey: "receivable",
    icon: "circle-dollar-sign",
    label: { zh: "应收结算", en: "Receivables" },
    children: [
      leaf("/receivables", "receivable.receivable.view", "应收台账", "AR ledger", view("receivable.receivable", [
        ["create", "新建应收", "New"],
        ["receipt", "登记收款", "Record receipt"],
      ])),
      leaf("/receivables/collection", "receivable.collection.view", "催收工作台", "Collection", view("receivable.collection", [["log", "记录催收", "Log follow-up"]])),
      leaf("/receivables/invoices", "receivable.invoice.view", "开票登记", "Invoices", view("receivable.invoice", [["create", "登记发票", "New invoice"]])),
    ],
  },
  {
    module: "M13",
    moduleKey: "purchase",
    icon: "shopping-cart",
    label: { zh: "采购管理", en: "Procurement" },
    children: [
      leaf("/purchases", "purchase.order.view", "采购单", "Purchase orders", view("purchase.order", [
        ["create", "新建采购单", "New"],
        ["cancel", "取消采购单", "Cancel"],
      ])),
      leaf("/purchases/receipts", "purchase.receipt.view", "到货登记", "Receipts", view("purchase.receipt", [["create", "登记到货", "Record receipt"]])),
    ],
  },
  {
    module: "M14",
    moduleKey: "factoryaudit",
    icon: "building-2",
    label: { zh: "验厂审计", en: "Factory audit" },
    children: [
      leaf("/factory-audits", "factoryaudit.plan.view", "审计计划", "Audit plans", view("factoryaudit.plan", [["edit", "维护计划", "Edit"]])),
      leaf("/factory-audits/records", "factoryaudit.record.view", "审计记录", "Audit records", view("factoryaudit.record", [["edit", "登记审计", "Edit"]])),
      leaf("/factory-audits/findings", "factoryaudit.finding.view", "整改跟踪", "Findings", view("factoryaudit.finding", [["edit", "更新整改", "Edit"]])),
    ],
  },
  {
    module: "M15",
    moduleKey: "document",
    icon: "folder",
    label: { zh: "资料管理", en: "Documents" },
    children: [
      leaf("/documents/handovers", "document.handover.view", "技术资料包", "Tech packs", view("document.handover", [
        ["edit", "维护资料包", "Edit"],
        ["complete", "开发移交", "Hand over"],
        ["change", "开发变更", "Change request"],
      ])),
      leaf("/documents/manuals", "document.manual.view", "客户手册", "Customer manuals", view("document.manual", [["edit", "维护手册", "Edit"]])),
      leaf("/documents/kb", "document.kb.view", "知识库", "Knowledge base", view("document.kb", [["edit", "维护知识库", "Edit"]])),
    ],
  },
  {
    module: "M16",
    moduleKey: "patrol",
    icon: "radar",
    label: { zh: "业务巡检", en: "Patrol" },
    children: [
      leaf("/patrol", "patrol.dashboard.view", "巡检仪表盘", "Dashboard", view("patrol.dashboard", [["run", "立即巡检", "Run now"]])),
      leaf("/patrol/rules", "patrol.rule.view", "巡检规则", "Rules", view("patrol.rule", [["edit", "维护规则", "Edit"]])),
      leaf("/patrol/runs", "patrol.run.view", "巡检任务", "Runs"),
    ],
  },
  {
    module: "M17",
    moduleKey: "metrics",
    icon: "bar-chart-3",
    label: { zh: "数据统计", en: "Analytics" },
    children: [
      leaf("/dashboards/sales", "metrics.sales.view", "业务看板", "Sales dashboard"),
      leaf("/dashboards/manager", "metrics.manager.view", "经理看板", "Manager dashboard"),
      leaf("/dashboards/gm", "metrics.gm.view", "总经理看板", "GM dashboard"),
      leaf("/dashboards/definitions", "metrics.definition.view", "指标口径", "Metric definitions"),
    ],
  },
  {
    module: "M18",
    moduleKey: "sync",
    icon: "refresh-cw",
    label: { zh: "数据同步", en: "Data sync" },
    children: [
      leaf("/sync/endpoints", "sync.endpoint.view", "对端系统管理", "Endpoints", view("sync.endpoint", [
        ["edit", "维护对端", "Edit"],
        ["credential", "管理凭据", "Credentials"],
      ])),
      leaf("/sync/mappings", "sync.mapping.view", "字段映射", "Field mappings", view("sync.mapping", [["edit", "维护映射", "Edit"]])),
      leaf("/sync/tasks", "sync.task.view", "同步任务管理", "Sync tasks", view("sync.task", [
        ["edit", "维护任务", "Edit"],
        ["run", "立即执行", "Run now"],
      ])),
      leaf("/sync/retry", "sync.retry.view", "重试队列", "Retry queue", view("sync.retry", [["run", "重试", "Retry"]])),
    ],
  },
  {
    module: "M19",
    moduleKey: "flow",
    icon: "workflow",
    label: { zh: "配置管理", en: "Configuration" },
    children: [
      leaf("/flow/modules", "flow.module.view", "模块配置", "Service modules", view("flow.module", [["edit", "维护服务目录", "Edit"]])),
      leaf("/flow/customers", "flow.customer.view", "流程配置", "Customer flows", view("flow.customer", [
        ["edit", "编辑流程", "Edit"],
        ["publish", "发布流程", "Publish"],
      ])),
      leaf("/flow/rule-packs", "flow.rulepack.view", "规则包", "Rule packs", view("flow.rulepack", [["edit", "维护规则包", "Edit"]])),
    ],
  },
  {
    module: "M20",
    moduleKey: "masterdata",
    icon: "database",
    label: { zh: "主数据管理", en: "Master data" },
    children: [
      leaf("/masterdata/customers", "masterdata.customer.view", "客户", "Customers", view("masterdata.customer", [["edit", "维护客户", "Edit"]])),
      leaf("/masterdata/factories", "masterdata.factory.view", "工厂与基地", "Factories & bases", view("masterdata.factory", [["edit", "维护工厂", "Edit"]])),
      leaf("/masterdata/needle-types", "masterdata.needle.view", "针型与机台", "Needle types", view("masterdata.needle", [["edit", "维护针型", "Edit"]])),
      leaf("/masterdata/materials", "masterdata.material.view", "物料", "Materials", view("masterdata.material", [["edit", "维护物料", "Edit"]])),
      leaf("/masterdata/test-agencies", "masterdata.agency.view", "检测机构", "Test agencies", view("masterdata.agency", [["edit", "维护机构", "Edit"]])),
      leaf("/masterdata/forwarders", "masterdata.forwarder.view", "货代船司", "Forwarders & carriers", view("masterdata.forwarder", [["edit", "维护货代", "Edit"]])),
      leaf("/masterdata/dictionaries", "masterdata.dictionary.view", "字典", "Dictionaries", view("masterdata.dictionary", [["edit", "维护字典", "Edit"]])),
    ],
  },
  {
    module: "M21",
    moduleKey: "iam",
    icon: "settings",
    label: { zh: "系统管理", en: "System" },
    children: [
      leaf("/system/users", "iam.user.view", "用户", "Users", view("iam.user", [
        ["edit", "维护用户", "Edit"],
        ["resetPassword", "重置密码", "Reset password"],
      ])),
      leaf("/system/roles", "iam.role.view", "角色管理", "Roles", view("iam.role", [
        ["edit", "维护角色", "Edit"],
        ["grant", "分配权限", "Grant"],
      ])),
      leaf("/system/orgs", "iam.org.view", "组织管理", "Organization", view("iam.org", [["edit", "维护组织", "Edit"]])),
      leaf("/system/audit-logs", "iam.audit.view", "操作日志", "Audit log", view("iam.audit", [["rollback", "回退关键变更", "Roll back"]])),
      leaf("/system/params", "iam.param.view", "系统参数", "System parameters", view("iam.param", [["edit", "维护参数", "Edit"]])),
    ],
  },
];

export function allLeaves(): MenuLeaf[] {
  return MENU.flatMap((g) => g.children);
}

export function menuPermissionCodes(): string[] {
  return allLeaves().map((l) => l.permission);
}

export function allPermissionCodes(): string[] {
  return allLeaves().flatMap((l) => [l.permission, ...l.actions.map((x) => x.code)]);
}

export function permissionLabel(code: string): Label | undefined {
  for (const l of allLeaves()) {
    if (l.permission === code) return l.label;
    const act = l.actions.find((x) => x.code === code);
    if (act) return act.label;
  }
  return undefined;
}

const ALL_BUT_SYSTEM_EDIT = [
  "*",
  "!iam.user.edit",
  "!iam.user.resetPassword",
  "!iam.role.edit",
  "!iam.role.grant",
  "!iam.org.edit",
  "!iam.param.edit",
  "!iam.audit.rollback",
  "!sync.endpoint.credential",
];

const COMMON = ["todo.*", "assistant.*", "metrics.definition.view"];

export const PERMISSION_PRESETS: Record<PresetRole["permissionPreset"], string[]> = {
  ADMIN: ["*"],
  GM: ALL_BUT_SYSTEM_EDIT,
  SALES_MANAGER: [
    ...COMMON,
    "planning.*",
    "sample.*",
    "quote.*",
    "sampleship.*",
    "testing.*",
    "packaging.*",
    "capacity.ledger.view",
    "capacity.task.view",
    "order.*",
    "inspection.inspection.view",
    "inspection.schedule.view",
    "shipment.*",
    "receivable.*",
    "purchase.order.view",
    "purchase.receipt.view",
    "document.*",
    "patrol.*",
    "metrics.sales.view",
    "metrics.manager.view",
    "flow.customer.view",
    "masterdata.customer.view",
    "iam.org.view",
  ],
  SALES: [
    ...COMMON,
    "planning.*",
    "sample.library.view",
    "sample.sample.view",
    "sample.sample.approve",
    "sample.material.view",
    "quote.quote.*",
    "quote.cost.view",
    "quote.strategy.view",
    "!quote.quote.override",
    "sampleship.*",
    "testing.request.view",
    "testing.request.create",
    "testing.report.view",
    "packaging.*",
    "order.*",
    "!order.order.cancel",
    "inspection.inspection.view",
    "inspection.inspection.create",
    "shipment.shipment.view",
    "shipment.booking.view",
    "receivable.receivable.view",
    "receivable.collection.*",
    "receivable.invoice.view",
    "document.handover.view",
    "document.handover.edit",
    "document.manual.view",
    "document.kb.view",
    "patrol.dashboard.view",
    "metrics.sales.view",
  ],
  TECH: [...COMMON, "planning.planning.view", "sample.*", "sampleship.*", "document.*", "testing.request.view"],
  QUALITY: [...COMMON, "sample.sample.view", "testing.*", "inspection.*", "factoryaudit.*", "masterdata.agency.view"],
  PLANNER: [
    ...COMMON,
    "capacity.*",
    "order.order.view",
    "order.order.advance",
    "order.monitor.view",
    "inspection.inspection.view",
    "inspection.schedule.*",
    "purchase.order.view",
    "masterdata.needle.*",
    "masterdata.factory.view",
  ],
  BUYER: [...COMMON, "purchase.*", "sample.material.*", "masterdata.material.*", "order.order.view"],
  CUSTOMS: [...COMMON, "shipment.*", "packaging.plan.view", "packaging.carton.view", "order.order.view", "masterdata.forwarder.*"],
  FINANCE: [...COMMON, "receivable.*", "order.order.view", "quote.quote.view", "quote.cost.view", "shipment.shipment.view"],
  PRODUCTION: [
    ...COMMON,
    "order.order.view",
    "order.order.advance",
    "order.order.factoryReply",
    "order.monitor.view",
    "packaging.plan.view",
    "packaging.carton.*",
    "capacity.ledger.view",
    "inspection.inspection.view",
  ],
};

function matches(pattern: string, code: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return code.startsWith(pattern.slice(0, -1));
  return pattern === code;
}

export function expandPermissionPatterns(patterns: string[]): string[] {
  const include = patterns.filter((p) => !p.startsWith("!"));
  const exclude = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  return allPermissionCodes().filter((code) => include.some((p) => matches(p, code)) && !exclude.some((p) => matches(p, code)));
}
