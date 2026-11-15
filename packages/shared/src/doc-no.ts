export const DOC_TYPES = {
  planning: { prefix: "BR", period: "YYMM" },
  sample: { prefix: "SP", period: "YYMM" },
  sampleShipment: { prefix: "SM", period: "YYMM" },
  testRequest: { prefix: "TST", period: "YYMM" },
  testReport: { prefix: "RPT", period: "YYMM" },
  handover: { prefix: "DH", period: "YYMM" },
  purchase: { prefix: "PUR", period: "YYMM" },
  packaging: { prefix: "PK", period: "YYMM" },
  carton: { prefix: "CT", period: "YYMM" },
  inspection: { prefix: "INSP", period: "YYMM" },
  booking: { prefix: "BK", period: "YYMM" },
  shipment: { prefix: "SH", period: "YYMM" },
  receivable: { prefix: "AR", period: "YYYYMM" },
  factoryAudit: { prefix: "AUD", period: "YYMM" },
  patrolRun: { prefix: "PT", period: "NONE" },
  patrolRule: { prefix: "IR", period: "NONE" },
  syncTask: { prefix: "SYN", period: "YYYY" },
  quoteStrategy: { prefix: "PS", period: "NONE" },
  role: { prefix: "R", period: "NONE" },
  org: { prefix: "ORG", period: "NONE" },
} as const;

export type DocType = keyof typeof DOC_TYPES;

const PERIOD_DIGITS = { NONE: 0, YYMM: 3, YYYYMM: 3, YYYY: 3 } as const;
const NONE_DIGITS: Partial<Record<DocType, number>> = { patrolRun: 4, patrolRule: 3, quoteStrategy: 3, role: 3, org: 3 };

export function periodKey(type: DocType, date: Date): string {
  const { period } = DOC_TYPES[type];
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  if (period === "YYMM") return yyyy.slice(2) + mm;
  if (period === "YYYYMM") return yyyy + mm;
  if (period === "YYYY") return yyyy;
  return "";
}

export function formatDocNo(type: DocType, date: Date, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid sequence ${seq}`);
  const { prefix, period } = DOC_TYPES[type];
  const digits = period === "NONE" ? (NONE_DIGITS[type] ?? 4) : PERIOD_DIGITS[period];
  const num = String(seq).padStart(digits, "0");
  if (period === "NONE") return type === "role" ? `${prefix}${num}` : type === "org" ? `${prefix}${num}` : `${prefix}-${num}`;
  return `${prefix}-${periodKey(type, date)}-${num}`;
}

export function quoteNo(styleNo: string, round: number): string {
  return `QT-${styleNo.replace(/^#/, "")}-${String(round).padStart(2, "0")}`;
}

export function parseDocNo(no: string): { prefix: string; period: string; seq: number } | null {
  const m = /^([A-Z]+)-(?:(\d{4}|\d{6})-)?(\d+)$/.exec(no);
  if (!m) return null;
  return { prefix: m[1]!, period: m[2] ?? "", seq: Number(m[3]) };
}

export const SEASON_PREFIXES = ["SS", "SP", "SU", "FA", "AW", "HO"] as const;

export function isSeasonCode(code: string): boolean {
  return /^(SS|SP|SU|FA|AW|HO)\d{2}$/.test(code);
}
