import type { Label, Tone } from "./label.js";
import type { ModuleCode } from "./modules.js";

export type GateCode = "G1" | "G2";

export const NODES = [
  { code: "N01", key: "brief", label: { zh: "企划接入", en: "Brief intake" }, modules: ["M02"] },
  { code: "N02", key: "sampling", label: { zh: "打样与批复", en: "Sampling & approval" }, modules: ["M03", "M05"] },
  { code: "N03", key: "testing", label: { zh: "测试", en: "Testing" }, modules: ["M06"] },
  { code: "N04", key: "quote", label: { zh: "报价", en: "Quotation" }, modules: ["M04"] },
  { code: "N05", key: "handover", label: { zh: "开发移交", en: "Dev handover" }, modules: ["M15"], gate: "G1" },
  { code: "N06", key: "poReview", label: { zh: "PO 复核", en: "PO review" }, modules: ["M09"] },
  { code: "N07", key: "trimsPacking", label: { zh: "辅料与包装", en: "Trims & packing" }, modules: ["M07", "M13"] },
  { code: "N08", key: "production", label: { zh: "备料与生产", en: "Materials & production" }, modules: ["M08", "M09", "M13"] },
  { code: "N09", key: "release", label: { zh: "验货与放行", en: "Inspection & release" }, modules: ["M10"], gate: "G2" },
  { code: "N10", key: "shipSettle", label: { zh: "出货与结算", en: "Shipping & settlement" }, modules: ["M11", "M12"] },
] as const satisfies readonly { code: string; key: string; label: Label; modules: readonly ModuleCode[]; gate?: GateCode }[];

export type NodeCode = (typeof NODES)[number]["code"];

export const NODE_STATES = {
  NOT_STARTED: { label: { zh: "待启动", en: "Not started" }, tone: "neutral" },
  IN_PROGRESS: { label: { zh: "进行中", en: "In progress" }, tone: "warning" },
  DONE: { label: { zh: "已完成", en: "Done" }, tone: "success" },
  BLOCKED: { label: { zh: "受阻", en: "Blocked" }, tone: "danger" },
  NOT_APPLICABLE: { label: { zh: "不适用", en: "N/A" }, tone: "neutral" },
} as const satisfies Record<string, { label: Label; tone: Tone }>;

export type NodeState = keyof typeof NODE_STATES;

export const GATES = {
  G1: {
    node: "N05",
    label: { zh: "开发移交五项齐套", en: "Handover: 5 items complete" },
    conditions: [
      { key: "sampleApproved", label: { zh: "样品已批准", en: "Sample approved" } },
      { key: "quoteAccepted", label: { zh: "报价已被客户接受", en: "Quote accepted" } },
      { key: "testReportValid", label: { zh: "测试报告有效", en: "Test report valid" } },
      { key: "qrsRetained", label: { zh: "QRS 品质参考样已留存", en: "QRS retained" } },
      { key: "techPackUploaded", label: { zh: "技术资料包已上传", en: "Tech pack uploaded" } },
    ],
  },
  G2: {
    node: "N09",
    label: { zh: "验货放行三条件", en: "Release: 3 conditions" },
    conditions: [
      { key: "finalPassed", label: { zh: "终验结论合格", en: "Final inspection passed" } },
      { key: "reportsValid", label: { zh: "测试报告在有效期内且合格", en: "Test reports valid" } },
      { key: "packingReady", label: { zh: "包装方案已确认且装箱齐套", en: "Packing confirmed & complete" } },
    ],
  },
} as const;

export type GateConditionKey = (typeof GATES)[GateCode]["conditions"][number]["key"];
