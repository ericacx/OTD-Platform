import type { Label } from "./label.js";

export const MODULES = [
  { code: "M00", key: "todo", label: { zh: "今日待办", en: "Today" } },
  { code: "M01", key: "assistant", label: { zh: "智能助手", en: "Assistant" } },
  { code: "M02", key: "planning", label: { zh: "企划管理", en: "Briefs" } },
  { code: "M03", key: "sample", label: { zh: "样品管理", en: "Samples" } },
  { code: "M04", key: "quote", label: { zh: "报价管理", en: "Quotation" } },
  { code: "M05", key: "sampleship", label: { zh: "寄样管理", en: "Sample shipping" } },
  { code: "M06", key: "testing", label: { zh: "测试管理", en: "Testing" } },
  { code: "M07", key: "packaging", label: { zh: "包装管理", en: "Packing" } },
  { code: "M08", key: "capacity", label: { zh: "计划管理", en: "Planning" } },
  { code: "M09", key: "order", label: { zh: "订单管理", en: "Orders" } },
  { code: "M10", key: "inspection", label: { zh: "验货管理", en: "Inspection" } },
  { code: "M11", key: "shipment", label: { zh: "出货管理", en: "Shipping" } },
  { code: "M12", key: "receivable", label: { zh: "应收结算", en: "Receivables" } },
  { code: "M13", key: "purchase", label: { zh: "采购管理", en: "Procurement" } },
  { code: "M14", key: "factoryaudit", label: { zh: "验厂审计", en: "Factory audit" } },
  { code: "M15", key: "document", label: { zh: "资料管理", en: "Documents" } },
  { code: "M16", key: "patrol", label: { zh: "业务巡检", en: "Patrol" } },
  { code: "M17", key: "metrics", label: { zh: "数据统计", en: "Analytics" } },
  { code: "M18", key: "sync", label: { zh: "数据同步", en: "Data sync" } },
  { code: "M19", key: "flow", label: { zh: "配置管理", en: "Configuration" } },
  { code: "M20", key: "masterdata", label: { zh: "主数据管理", en: "Master data" } },
  { code: "M21", key: "iam", label: { zh: "系统管理", en: "System" } },
] as const satisfies readonly { code: string; key: string; label: Label }[];

export type ModuleCode = (typeof MODULES)[number]["code"];
export type ModuleKey = (typeof MODULES)[number]["key"];

export function moduleByCode(code: ModuleCode) {
  const found = MODULES.find((m) => m.code === code);
  if (!found) throw new Error(`unknown module ${code}`);
  return found;
}
