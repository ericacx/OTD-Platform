import type { ExtractedLine, ExtractedValue, PoExtraction } from "@otd/contracts/order";
import ExcelJS from "exceljs";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_TYPE = "application/pdf";

export const PO_EXTRACT_INSTRUCTIONS = [
  "你是针织 / 袜业代工企业的订单录入员。请从客户 PO 原件中抽取订单字段，按给定结构输出。",
  "规则：客户编号（PO 号、款号、SKU）原样保留，不改写、不补前缀；日期统一为 YYYY-MM-DD；币种用 ISO 三位代码；",
  "运输方式归一为 OCEAN / AIR / RAIL / EXPRESS；季节编码形如 AW26、FA27；",
  "每个字段给出 0–1 的置信度和原文出处（source，可为 null）；找不到的字段 value 为 null、confidence 为 0；",
  "明细按 款号 × 颜色 × 尺码 逐行列出数量（双）与单价，不要合并或推算。",
].join("\n");

const FIELD_SYNONYMS: Record<Exclude<keyof PoExtraction, "lines">, string[]> = {
  poNo: ["po", "po no", "po number", "po#", "po #", "purchase order", "purchase order no", "订单号", "客户po", "客户 po", "po号"],
  revision: ["rev", "revision", "po version", "po 版本", "版本", "po rev"],
  customer: ["customer", "client", "buyer", "客户", "客户名称"],
  seasonCode: ["season", "季节"],
  tradeTerm: ["incoterm", "incoterms", "trade term", "trade terms", "terms of delivery", "贸易术语"],
  paymentTerms: ["payment", "payment terms", "payment term", "付款条款", "付款方式"],
  currency: ["currency", "币种", "货币"],
  orderDate: ["order date", "po date", "issue date", "下单日期", "订单日期"],
  dueDate: ["delivery date", "due date", "ship date", "ex-factory", "ex factory date", "required date", "交期", "客户交期", "交货日期"],
  transportMode: ["ship mode", "ship via", "transport", "transport mode", "shipment mode", "运输方式"],
  destination: ["destination", "port of discharge", "ship to", "目的地", "目的港"],
  buyerEntity: ["buyer entity", "bill to", "买方主体"],
};

const LINE_SYNONYMS = {
  styleNo: ["style", "style no", "style no.", "style#", "style #", "style number", "article", "款号", "款式编号"],
  color: ["color", "colour", "颜色"],
  size: ["size", "尺码"],
  sku: ["sku", "upc", "ean", "barcode"],
  quantity: ["qty", "quantity", "pairs", "qty (pairs)", "数量", "双数"],
  unitPrice: ["unit price", "price", "fob", "fob price", "单价"],
} as const;

type LineKey = keyof typeof LINE_SYNONYMS;

const norm = (s: string) => s.toLowerCase().replace(/[：:]+\s*$/, "").replace(/\s+/g, " ").trim();
const empty = (): ExtractedValue => ({ value: null, confidence: 0, source: null });
const found = (value: string, source: string, confidence = 0.9): ExtractedValue => ({ value, confidence, source });

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value);
}

export async function excelToText(data: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const out: string[] = [];
  wb.eachSheet((sheet) => {
    out.push(`## Sheet: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).replace(/[\t\n]+/g, " ").trim());
      out.push(cells.join("\t"));
    });
  });
  return out.join("\n");
}

function normalizeDate(v: string): string | null {
  const m = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(v);
  if (!m) return null;
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

export function normalizeTransport(v: string): string {
  const s = v.toLowerCase();
  if (/rail|班列|铁路/.test(s)) return "RAIL";
  if (/air|空运/.test(s)) return "AIR";
  if (/express|courier|快递/.test(s)) return "EXPRESS";
  if (/sea|ocean|海运|vessel/.test(s)) return "OCEAN";
  return v.trim().toUpperCase();
}

function toNumber(v: string): number | null {
  const n = Number(v.replace(/[,\s$€¥]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}

function headerIndex(cells: string[]): Partial<Record<LineKey, number>> | null {
  const map: Partial<Record<LineKey, number>> = {};
  cells.forEach((c, i) => {
    const n = norm(c);
    for (const key of Object.keys(LINE_SYNONYMS) as LineKey[]) {
      if (map[key] === undefined && (LINE_SYNONYMS[key] as readonly string[]).includes(n)) map[key] = i;
    }
  });
  return map.styleNo !== undefined && map.quantity !== undefined ? map : null;
}

function fieldOf(label: string): Exclude<keyof PoExtraction, "lines"> | null {
  const n = norm(label);
  for (const key of Object.keys(FIELD_SYNONYMS) as Exclude<keyof PoExtraction, "lines">[]) {
    if (FIELD_SYNONYMS[key].includes(n)) return key;
  }
  return null;
}

function finalize(field: Exclude<keyof PoExtraction, "lines">, raw: string): string {
  if (field === "orderDate" || field === "dueDate") return normalizeDate(raw) ?? raw;
  if (field === "revision") return /\d+/.exec(raw)?.[0] ?? raw;
  if (field === "transportMode") return normalizeTransport(raw);
  if (field === "currency") return raw.trim().toUpperCase().slice(0, 3);
  if (field === "seasonCode") return raw.trim().toUpperCase();
  return raw.trim();
}

export function blankExtraction(): PoExtraction {
  return {
    poNo: empty(),
    revision: empty(),
    customer: empty(),
    seasonCode: empty(),
    tradeTerm: empty(),
    paymentTerms: empty(),
    currency: empty(),
    orderDate: empty(),
    dueDate: empty(),
    transportMode: empty(),
    destination: empty(),
    buyerEntity: empty(),
    lines: [],
  };
}

export function parsePoText(text: string): PoExtraction {
  const result = blankExtraction();
  const rows = text.split(/\r?\n/).map((r) => r.split("\t"));
  let header: Partial<Record<LineKey, number>> | null = null;
  for (const [rowNo, cells] of rows.entries()) {
    if (cells[0]?.startsWith("## Sheet:")) continue;
    if (!header) {
      header = headerIndex(cells);
      if (header) continue;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] ?? "";
        const inline = /^([^:：]{1,30})[:：]\s*(.+)$/.exec(cell);
        const label = inline ? inline[1]! : cell;
        const field = fieldOf(label);
        if (!field || result[field].value !== null) continue;
        const raw = inline ? inline[2]! : (cells.slice(i + 1).find((c) => c.trim() !== "") ?? "");
        if (raw.trim()) result[field] = found(finalize(field, raw), `第 ${rowNo + 1} 行：${label.trim()}`);
      }
      continue;
    }
    const get = (k: LineKey) => (header![k] === undefined ? "" : (cells[header![k]!] ?? "").trim());
    const styleNo = get("styleNo").replace(/^#/, "");
    if (!styleNo || /^(total|合计|小计)/i.test(styleNo)) {
      if (cells.every((c) => !c.trim())) header = null;
      continue;
    }
    const qty = toNumber(get("quantity"));
    if (qty === null) continue;
    const line: ExtractedLine = {
      styleNo,
      color: get("color") || null,
      size: get("size") || null,
      sku: get("sku") || null,
      quantity: Math.round(qty),
      unitPrice: toNumber(get("unitPrice")),
      confidence: 0.9,
    };
    result.lines.push(line);
  }
  return result;
}

export function extractFromFilename(filename: string): PoExtraction {
  const result = blankExtraction();
  const base = filename.replace(/\.[^.]+$/, "");
  const po = /PO[-_ ]?(\d{5,})/i.exec(base);
  result.poNo = po ? found(`PO${po[1]}`, `文件名 ${filename}`, 0.4) : found(base.trim(), `文件名 ${filename}`, 0.2);
  const season = /(SS|SP|SU|FA|AW|HO)\d{2}/i.exec(base);
  if (season) result.seasonCode = found(season[0].toUpperCase(), `文件名 ${filename}`, 0.4);
  return result;
}

export function fakePoExtract(req: { text?: string; document?: { filename: string } }): PoExtraction {
  if (req.text) return parsePoText(req.text);
  return extractFromFilename(req.document?.filename ?? "PO");
}
