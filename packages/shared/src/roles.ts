import type { Label } from "./label.js";

export const DATA_SCOPES = {
  SELF: { label: { zh: "仅本人", en: "Own records" } },
  ORG: { label: { zh: "本组织", en: "Own org" } },
  ORG_AND_CHILDREN: { label: { zh: "本组织及下级", en: "Own org & below" } },
  ALL: { label: { zh: "全部数据", en: "All data" } },
} as const;
export type DataScope = keyof typeof DATA_SCOPES;

export const ROLE_TYPES = {
  BUSINESS: { label: { zh: "业务角色", en: "Business role" } },
  MANAGEMENT: { label: { zh: "管理角色", en: "Management role" } },
} as const;
export type RoleType = keyof typeof ROLE_TYPES;

export type PresetRole = {
  code: string;
  label: Label;
  type: RoleType;
  dataScope: DataScope;
  department: Label;
  allCustomers: boolean;
  permissionPreset: "SALES" | "SALES_MANAGER" | "GM" | "TECH" | "QUALITY" | "PLANNER" | "BUYER" | "CUSTOMS" | "FINANCE" | "PRODUCTION" | "ADMIN";
};

export const PRESET_ROLES: readonly PresetRole[] = [
  { code: "R001", label: { zh: "业务员", en: "Sales rep" }, type: "BUSINESS", dataScope: "SELF", department: { zh: "业务部", en: "Sales" }, allCustomers: false, permissionPreset: "SALES" },
  { code: "R002", label: { zh: "业务经理", en: "Sales manager" }, type: "MANAGEMENT", dataScope: "ORG_AND_CHILDREN", department: { zh: "业务部", en: "Sales" }, allCustomers: true, permissionPreset: "SALES_MANAGER" },
  { code: "R003", label: { zh: "业务总经理", en: "General manager" }, type: "MANAGEMENT", dataScope: "ALL", department: { zh: "业务部", en: "Sales" }, allCustomers: true, permissionPreset: "GM" },
  { code: "R004", label: { zh: "技术员（打样）", en: "Sampling technician" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "技术部", en: "Technical" }, allCustomers: true, permissionPreset: "TECH" },
  { code: "R005", label: { zh: "品质员", en: "Quality inspector" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "品质部", en: "Quality" }, allCustomers: true, permissionPreset: "QUALITY" },
  { code: "R006", label: { zh: "计划员", en: "Planner" }, type: "BUSINESS", dataScope: "ORG_AND_CHILDREN", department: { zh: "计划部", en: "Planning" }, allCustomers: true, permissionPreset: "PLANNER" },
  { code: "R007", label: { zh: "采购员", en: "Buyer" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "采购部", en: "Procurement" }, allCustomers: true, permissionPreset: "BUYER" },
  { code: "R008", label: { zh: "关务单证员", en: "Customs clerk" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "关务部", en: "Customs" }, allCustomers: true, permissionPreset: "CUSTOMS" },
  { code: "R009", label: { zh: "财务", en: "Finance" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "财务部", en: "Finance" }, allCustomers: true, permissionPreset: "FINANCE" },
  { code: "R010", label: { zh: "生产跟单", en: "Production follow-up" }, type: "BUSINESS", dataScope: "ORG", department: { zh: "生产部", en: "Production" }, allCustomers: true, permissionPreset: "PRODUCTION" },
  { code: "R090", label: { zh: "系统管理员", en: "System admin" }, type: "MANAGEMENT", dataScope: "ALL", department: { zh: "信息部", en: "IT" }, allCustomers: true, permissionPreset: "ADMIN" },
];
