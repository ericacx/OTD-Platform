import type { Label, Tone } from "./label.js";

type StatusDef = { label: Label; tone: Tone };
type Machine<S extends string> = {
  label: Label;
  initial: S;
  statuses: Record<S, StatusDef>;
  transitions: Partial<Record<S, readonly S[]>>;
};

function machine<S extends string>(m: {
  label: Label;
  initial: NoInfer<S>;
  statuses: Record<S, StatusDef>;
  transitions: Partial<Record<NoInfer<S>, readonly NoInfer<S>[]>>;
}): Machine<S> {
  return m;
}

const s = (zh: string, en: string, tone: Tone): StatusDef => ({ label: { zh, en }, tone });

export const STATUS_MACHINES = {
  planning: machine({
    label: { zh: "企划", en: "Brief" },
    initial: "RECOGNIZING",
    statuses: {
      RECOGNIZING: s("识别中", "Recognizing", "info"),
      EXTRACTED: s("提取完成", "Extracted", "warning"),
      CONFIRMED: s("已确认", "Confirmed", "success"),
      ARCHIVED: s("已归档", "Archived", "neutral"),
      RECOGNITION_FAILED: s("识别失败", "Recognition failed", "danger"),
    },
    transitions: {
      RECOGNIZING: ["EXTRACTED", "RECOGNITION_FAILED"],
      RECOGNITION_FAILED: ["RECOGNIZING", "EXTRACTED"],
      EXTRACTED: ["CONFIRMED", "ARCHIVED"],
      CONFIRMED: ["ARCHIVED"],
    },
  }),
  sampleRound: machine({
    label: { zh: "打样轮次", en: "Sample round" },
    initial: "ISSUED",
    statuses: {
      ISSUED: s("已下达", "Issued", "info"),
      RECEIVING: s("待接收", "To receive", "info"),
      SOURCING: s("原料采购", "Sourcing", "info"),
      KNITTING: s("上机打样", "Knitting", "info"),
      QC: s("质检", "QC", "info"),
      READY: s("待取样", "Ready for pickup", "info"),
      SHIPPED: s("已寄样", "Sample sent", "info"),
      AWAITING_APPROVAL: s("待批复", "Awaiting approval", "warning"),
      APPROVED: s("已批准", "Approved", "success"),
      REVISE: s("需改样", "Revise", "danger"),
    },
    transitions: {
      ISSUED: ["RECEIVING"],
      RECEIVING: ["SOURCING"],
      SOURCING: ["KNITTING"],
      KNITTING: ["QC"],
      QC: ["READY", "KNITTING"],
      READY: ["SHIPPED", "AWAITING_APPROVAL"],
      SHIPPED: ["AWAITING_APPROVAL"],
      AWAITING_APPROVAL: ["APPROVED", "REVISE"],
    },
  }),
  sampleShipment: machine({
    label: { zh: "寄样单", en: "Sample shipment" },
    initial: "DRAFT",
    statuses: {
      DRAFT: s("草稿", "Draft", "neutral"),
      SENT: s("已寄出", "Sent", "info"),
      SIGNED: s("已签收", "Signed", "success"),
    },
    transitions: { DRAFT: ["SENT"], SENT: ["SIGNED"] },
  }),
  testRequest: machine({
    label: { zh: "送测单", en: "Test request" },
    initial: "DRAFT",
    statuses: {
      DRAFT: s("草稿", "Draft", "neutral"),
      AWAITING_SAMPLE: s("待送样", "Awaiting sample", "warning"),
      TESTING: s("测试中", "Testing", "info"),
      COMPLETED: s("测试完成", "Completed", "success"),
    },
    transitions: { DRAFT: ["AWAITING_SAMPLE"], AWAITING_SAMPLE: ["TESTING"], TESTING: ["COMPLETED"] },
  }),
  testReport: machine({
    label: { zh: "测试报告", en: "Test report" },
    initial: "VALID",
    statuses: {
      VALID: s("有效", "Valid", "success"),
      EXPIRING: s("即将过期", "Expiring", "warning"),
      EXPIRED: s("已过期", "Expired", "danger"),
    },
    transitions: { VALID: ["EXPIRING", "EXPIRED"], EXPIRING: ["VALID", "EXPIRED"] },
  }),
  quoteRound: machine({
    label: { zh: "报价轮次", en: "Quote round" },
    initial: "DRAFT",
    statuses: {
      DRAFT: s("草稿", "Draft", "neutral"),
      COST_REVIEW: s("成本审核中", "Cost review", "warning"),
      QUOTED: s("已报价", "Quoted", "info"),
      ACCEPTED: s("已接受", "Accepted", "success"),
      REJECTED: s("已拒绝", "Rejected", "danger"),
      LAPSED: s("已失效", "Lapsed", "neutral"),
    },
    transitions: {
      DRAFT: ["COST_REVIEW", "QUOTED"],
      COST_REVIEW: ["QUOTED", "DRAFT"],
      QUOTED: ["ACCEPTED", "REJECTED", "LAPSED"],
    },
  }),
  handover: machine({
    label: { zh: "开发移交包", en: "Handover package" },
    initial: "COLLECTING",
    statuses: {
      COLLECTING: s("齐套中", "Collecting", "info"),
      HANDED_OVER: s("已移交", "Handed over", "success"),
    },
    transitions: { COLLECTING: ["HANDED_OVER"], HANDED_OVER: ["COLLECTING"] },
  }),
  order: machine({
    label: { zh: "客户订单", en: "Customer order" },
    initial: "PENDING_CONFIRM",
    statuses: {
      PENDING_CONFIRM: s("待确认", "Pending confirm", "warning"),
      TO_SCHEDULE: s("待排产", "To schedule", "info"),
      IN_PRODUCTION: s("生产中", "In production", "info"),
      TO_SHIP: s("待发货", "Ready to ship", "info"),
      COMPLETED: s("已完成", "Completed", "success"),
      CANCELLED: s("已取消", "Cancelled", "neutral"),
    },
    transitions: {
      PENDING_CONFIRM: ["TO_SCHEDULE", "CANCELLED"],
      TO_SCHEDULE: ["IN_PRODUCTION", "CANCELLED"],
      IN_PRODUCTION: ["TO_SHIP", "CANCELLED"],
      TO_SHIP: ["COMPLETED"],
    },
  }),
  packagingPlan: machine({
    label: { zh: "包装方案", en: "Packing plan" },
    initial: "DRAFT",
    statuses: {
      DRAFT: s("草稿", "Draft", "neutral"),
      PENDING_CUSTOMER: s("待客户确认", "Awaiting customer", "warning"),
      CONFIRMED: s("已确认", "Confirmed", "success"),
    },
    transitions: { DRAFT: ["PENDING_CUSTOMER"], PENDING_CUSTOMER: ["CONFIRMED", "DRAFT"], CONFIRMED: ["DRAFT"] },
  }),
  carton: machine({
    label: { zh: "装箱单", en: "Carton list" },
    initial: "TO_PACK",
    statuses: {
      TO_PACK: s("待装箱", "To pack", "warning"),
      PACKING: s("装箱中", "Packing", "info"),
      PACKED: s("已装箱", "Packed", "success"),
    },
    transitions: { TO_PACK: ["PACKING"], PACKING: ["PACKED"] },
  }),
  purchase: machine({
    label: { zh: "采购单", en: "Purchase order" },
    initial: "ORDERED",
    statuses: {
      ORDERED: s("已下单", "Ordered", "info"),
      PARTIAL: s("部分到货", "Partially received", "warning"),
      RECEIVED: s("已到货", "Received", "success"),
      CANCELLED: s("已取消", "Cancelled", "neutral"),
    },
    transitions: { ORDERED: ["PARTIAL", "RECEIVED", "CANCELLED"], PARTIAL: ["RECEIVED"] },
  }),
  inspection: machine({
    label: { zh: "验货单", en: "Inspection" },
    initial: "TO_SCHEDULE",
    statuses: {
      TO_SCHEDULE: s("待排期", "To schedule", "warning"),
      SCHEDULED: s("已排期", "Scheduled", "info"),
      INSPECTED: s("已验", "Inspected", "info"),
      REWORK: s("整改复验", "Rework", "warning"),
      RELEASED: s("已放行", "Released", "success"),
      CANCELLED: s("已取消", "Cancelled", "neutral"),
    },
    transitions: {
      TO_SCHEDULE: ["SCHEDULED", "CANCELLED"],
      SCHEDULED: ["INSPECTED", "CANCELLED"],
      INSPECTED: ["REWORK", "RELEASED"],
      REWORK: ["INSPECTED"],
    },
  }),
  shipment: machine({
    label: { zh: "出货单", en: "Shipment" },
    initial: "BOOKED",
    statuses: {
      BOOKED: s("订舱确认", "Booked", "info"),
      PACKED: s("装箱完成", "Packed", "info"),
      SAILED: s("已开船", "Sailed", "info"),
      ARRIVED: s("已到港", "Arrived", "info"),
      SIGNED: s("已签收", "Signed", "success"),
    },
    transitions: { BOOKED: ["PACKED"], PACKED: ["SAILED"], SAILED: ["ARRIVED"], ARRIVED: ["SIGNED"] },
  }),
  receivable: machine({
    label: { zh: "应收单", en: "Receivable" },
    initial: "NOT_DUE",
    statuses: {
      NOT_DUE: s("未到期", "Not due", "info"),
      DUE: s("待收款", "Due", "warning"),
      PARTIAL: s("部分收款", "Partially paid", "warning"),
      PAID: s("已收款", "Paid", "success"),
      OFFSET_PENDING: s("待冲抵", "Offset pending", "warning"),
      OFFSET: s("已冲抵", "Offset", "success"),
    },
    transitions: {
      NOT_DUE: ["DUE", "PARTIAL", "PAID"],
      DUE: ["PARTIAL", "PAID"],
      PARTIAL: ["PAID"],
      OFFSET_PENDING: ["OFFSET"],
    },
  }),
  factoryAudit: machine({
    label: { zh: "验厂审计", en: "Factory audit" },
    initial: "PLANNED",
    statuses: {
      PLANNED: s("计划中", "Planned", "info"),
      IN_PROGRESS: s("审计中", "In progress", "info"),
      RECTIFYING: s("整改中", "Rectifying", "warning"),
      CLOSED: s("已关闭", "Closed", "success"),
    },
    transitions: { PLANNED: ["IN_PROGRESS"], IN_PROGRESS: ["RECTIFYING", "CLOSED"], RECTIFYING: ["CLOSED"] },
  }),
  ledgerTask: machine({
    label: { zh: "台账更新任务", en: "Ledger task" },
    initial: "PENDING",
    statuses: {
      PENDING: s("待更新", "Pending", "warning"),
      UPDATING: s("更新中", "Updating", "info"),
      DONE: s("已完成", "Done", "success"),
      OVERDUE: s("已逾期", "Overdue", "danger"),
    },
    transitions: { PENDING: ["UPDATING", "OVERDUE"], OVERDUE: ["UPDATING"], UPDATING: ["DONE", "OVERDUE"], DONE: ["PENDING"] },
  }),
  capacityVersion: machine({
    label: { zh: "产能台账版本", en: "Capacity ledger version" },
    initial: "DRAFT",
    statuses: {
      DRAFT: s("草稿", "Draft", "neutral"),
      PUBLISHED: s("已发布", "Published", "success"),
    },
    transitions: { DRAFT: ["PUBLISHED"] },
  }),
  patrolHit: machine({
    label: { zh: "巡检命中", en: "Patrol hit" },
    initial: "OPEN",
    statuses: {
      OPEN: s("待处理", "Open", "danger"),
      HANDLING: s("处理中", "Handling", "warning"),
      CLOSED: s("已关闭", "Closed", "success"),
    },
    transitions: { OPEN: ["HANDLING", "CLOSED"], HANDLING: ["CLOSED"] },
  }),
  todo: machine({
    label: { zh: "待办", en: "To-do" },
    initial: "OPEN",
    statuses: {
      OPEN: s("待处理", "Open", "warning"),
      DONE: s("已完成", "Done", "success"),
      CANCELLED: s("已取消", "Cancelled", "neutral"),
    },
    transitions: { OPEN: ["DONE", "CANCELLED"] },
  }),
  syncRun: machine({
    label: { zh: "同步执行", en: "Sync run" },
    initial: "RUNNING",
    statuses: {
      RUNNING: s("执行中", "Running", "info"),
      SUCCESS: s("成功", "Success", "success"),
      PARTIAL: s("部分成功", "Partial", "warning"),
      FAILED: s("失败", "Failed", "danger"),
    },
    transitions: { RUNNING: ["SUCCESS", "PARTIAL", "FAILED"], PARTIAL: ["SUCCESS"], FAILED: ["SUCCESS", "PARTIAL"] },
  }),
  syncRecord: machine({
    label: { zh: "同步记录", en: "Sync record" },
    initial: "SUCCESS",
    statuses: {
      SUCCESS: s("成功", "Success", "success"),
      FAILED: s("失败", "Failed", "danger"),
      SKIPPED: s("跳过", "Skipped", "neutral"),
      RETRYING: s("重试中", "Retrying", "warning"),
    },
    transitions: { FAILED: ["RETRYING", "SUCCESS", "SKIPPED"], RETRYING: ["SUCCESS", "FAILED", "SKIPPED"] },
  }),
} as const;

export type MachineKey = keyof typeof STATUS_MACHINES;
export type StatusOf<K extends MachineKey> = keyof (typeof STATUS_MACHINES)[K]["statuses"] & string;

export function statusCodes<K extends MachineKey>(key: K): StatusOf<K>[] {
  return Object.keys(STATUS_MACHINES[key].statuses) as StatusOf<K>[];
}

export function canTransition<K extends MachineKey>(key: K, from: StatusOf<K>, to: StatusOf<K>): boolean {
  const transitions = STATUS_MACHINES[key].transitions as Partial<Record<string, readonly string[]>>;
  return (transitions[from] ?? []).includes(to);
}

export function statusLabel(key: MachineKey, code: string): Label {
  const statuses = STATUS_MACHINES[key].statuses as Record<string, StatusDef>;
  return statuses[code]?.label ?? { zh: code, en: code };
}

export function statusTone(key: MachineKey, code: string): Tone {
  const statuses = STATUS_MACHINES[key].statuses as Record<string, StatusDef>;
  return statuses[code]?.tone ?? "neutral";
}

export const RESULTS = {
  PASS: s("合格", "Pass", "success"),
  FAIL: s("不合格", "Fail", "danger"),
} as const;
export type InspectionResult = keyof typeof RESULTS;

export const INSPECTION_STAGES = {
  IPI: { label: { zh: "初期验货 IPI", en: "IPI" }, final: false },
  DPI: { label: { zh: "中期验货 DPI", en: "DPI" }, final: false },
  FRI: { label: { zh: "尾期验货 FRI", en: "FRI" }, final: true },
} as const;
export type InspectionStage = keyof typeof INSPECTION_STAGES;

export const LIGHTS = {
  RED: s("红灯", "Red", "danger"),
  YELLOW: s("黄灯", "Amber", "warning"),
  GREEN: s("绿灯", "Green", "success"),
} as const;
export type Light = keyof typeof LIGHTS;

export const SEVERITIES = {
  HIGH: s("高", "High", "danger"),
  MEDIUM: s("中", "Medium", "warning"),
  LOW: s("低", "Low", "info"),
} as const;
export type Severity = keyof typeof SEVERITIES;
