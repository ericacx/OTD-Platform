import type { SyncCodeMaps, SyncMappingField, SyncMappingIssue, SyncTransform } from "@otd/contracts/sync";

export type MappingIssueType = SyncMappingIssue["type"];
export type TransformOutcome = { ok: true; value: unknown } | { ok: false; type: MappingIssueType; message: string; suggestion: string };
export type MappingResult = { ok: boolean; output: Record<string, unknown>; errors: SyncMappingIssue[] };
type TransformContext = { record: Record<string, unknown>; codeMaps: SyncCodeMaps; source: string; target: string };

const DATE_TOKENS = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;
const AUTO_DATE_PATTERNS = ["YYYY-MM-DD", "YYYY/MM/DD", "YYYYMMDD", "YYYY.MM.DD"];

const UNITS: Record<string, [string, number]> = {
  pcs: ["count", 1],
  pair: ["count", 1],
  pairs: ["count", 1],
  dozen: ["count", 12],
  doz: ["count", 12],
  g: ["mass", 1],
  kg: ["mass", 1000],
  lb: ["mass", 453.59237],
  cm: ["length", 1],
  m: ["length", 100],
  inch: ["length", 2.54],
  yd: ["length", 91.44],
};

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function readPath(record: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = record;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(part);
      current = Number.isInteger(idx) ? current[idx] : undefined;
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function show(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function fail(type: MappingIssueType, message: string, suggestion: string): TransformOutcome {
  return { ok: false, type, message, suggestion };
}

type DateParts = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function patternRegex(pattern: string): { regex: RegExp; order: string[] } {
  const order: string[] = [];
  let source = "";
  let i = 0;
  while (i < pattern.length) {
    const token = DATE_TOKENS.find((t) => pattern.startsWith(t, i));
    if (token) {
      order.push(token);
      source += token === "YYYY" ? "(\\d{4})" : "(\\d{1,2})";
      i += token.length;
    } else {
      source += pattern[i]!.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      i += 1;
    }
  }
  return { regex: new RegExp(`^${source}$`), order };
}

function validParts(p: DateParts): boolean {
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.h > 23 || p.mi > 59 || p.s > 59) return false;
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  return dt.getUTCFullYear() === p.y && dt.getUTCMonth() === p.mo - 1 && dt.getUTCDate() === p.d;
}

function parseWithPattern(text: string, pattern: string): DateParts | null {
  const { regex, order } = patternRegex(pattern);
  const m = regex.exec(text);
  if (!m) return null;
  const parts: DateParts = { y: 0, mo: 1, d: 1, h: 0, mi: 0, s: 0 };
  order.forEach((token, idx) => {
    const n = Number(m[idx + 1]);
    if (token === "YYYY") parts.y = n;
    else if (token === "MM") parts.mo = n;
    else if (token === "DD") parts.d = n;
    else if (token === "HH") parts.h = n;
    else if (token === "mm") parts.mi = n;
    else parts.s = n;
  });
  return validParts(parts) ? parts : null;
}

export function parseDate(value: unknown, pattern?: string): DateParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { y: value.getUTCFullYear(), mo: value.getUTCMonth() + 1, d: value.getUTCDate(), h: value.getUTCHours(), mi: value.getUTCMinutes(), s: value.getUTCSeconds() };
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (pattern) return parseWithPattern(text, pattern);
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (iso) {
    const parts = { y: Number(iso[1]), mo: Number(iso[2]), d: Number(iso[3]), h: Number(iso[4]), mi: Number(iso[5]), s: Number(iso[6] ?? 0) };
    return validParts(parts) ? parts : null;
  }
  for (const p of AUTO_DATE_PATTERNS) {
    const parts = parseWithPattern(text, p);
    if (parts) return parts;
  }
  return null;
}

export function formatDate(parts: DateParts, pattern: string): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const values: Record<string, string> = { YYYY: pad(parts.y, 4), MM: pad(parts.mo), DD: pad(parts.d), HH: pad(parts.h), mm: pad(parts.mi), ss: pad(parts.s) };
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const token = DATE_TOKENS.find((t) => pattern.startsWith(t, i));
    if (token) {
      out += values[token];
      i += token.length;
    } else {
      out += pattern[i];
      i += 1;
    }
  }
  return out;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[,\s]/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

const transforms: Record<SyncTransform, (value: unknown, args: Record<string, unknown>, ctx: TransformContext) => TransformOutcome> = {
  trim(value) {
    if (value === null || value === undefined) return { ok: true, value: null };
    if (typeof value === "string") return { ok: true, value: value.trim() };
    if (typeof value === "number" || typeof value === "boolean") return { ok: true, value: String(value) };
    return fail("FORMAT_MISMATCH", `「${show(value)}」不是文本`, "检查来源字段类型或去掉 trim 转换");
  },

  required(value, _args, ctx) {
    if (isEmpty(value)) return fail("REQUIRED_MISSING", `必填字段「${ctx.source || ctx.target}」为空`, "补数据后手动重试");
    return { ok: true, value };
  },

  default(value, args) {
    return { ok: true, value: isEmpty(value) ? (args.value ?? null) : value };
  },

  number(value, args) {
    if (isEmpty(value)) return { ok: true, value: null };
    const n = toNumber(value);
    if (n === null) return fail("FORMAT_MISMATCH", `「${show(value)}」不是有效数字`, "检查来源数据，数字不能包含文字");
    if (args.integer === true) return { ok: true, value: Math.round(n) };
    return { ok: true, value: typeof args.decimals === "number" ? roundTo(n, args.decimals) : n };
  },

  unit(value, args) {
    if (isEmpty(value)) return { ok: true, value: null };
    const n = toNumber(value);
    if (n === null) return fail("FORMAT_MISMATCH", `「${show(value)}」不是有效数量`, "检查来源数据，数量不能包含文字");
    const decimals = typeof args.decimals === "number" ? args.decimals : 4;
    if (typeof args.factor === "number") return { ok: true, value: roundTo(n * args.factor, decimals) };
    const from = stringArg(args, "from")?.toLowerCase() ?? "";
    const to = stringArg(args, "to")?.toLowerCase() ?? "";
    const a = UNITS[from];
    const b = UNITS[to];
    if (!a || !b || a[0] !== b[0]) return fail("FORMAT_MISMATCH", `不支持的单位换算 ${from || "?"} → ${to || "?"}`, "在转换规则里改用支持的单位或填写换算系数 factor");
    return { ok: true, value: roundTo((n * a[1]) / b[1], decimals) };
  },

  dateFormat(value, args) {
    if (isEmpty(value)) return { ok: true, value: null };
    const from = stringArg(args, "from");
    const to = stringArg(args, "to") ?? "YYYY-MM-DD";
    const parts = parseDate(value, from);
    if (!parts) return fail("FORMAT_MISMATCH", `来源日期格式与目标不一致（值「${show(value)}」${from ? `，期望 ${from}` : ""}）`, `在转换规则里统一为 ${to}`);
    return { ok: true, value: formatDate(parts, to) };
  },

  codeMap(value, args, ctx) {
    if (isEmpty(value)) return { ok: true, value: null };
    const name = stringArg(args, "map") ?? ctx.target;
    const table = ctx.codeMaps[name];
    if (!table) return fail("MAPPING_MISS", `码表「${name}」不存在`, `新建码表「${name}」后手动重试`);
    const key = show(value).trim();
    const hit = table[key];
    if (hit === undefined) {
      if (args.fallback !== undefined) return { ok: true, value: args.fallback };
      return fail("MAPPING_MISS", `码表「${name}」中没有「${key}」的对应编码`, `补充码表「${name}」后手动重试`);
    }
    return { ok: true, value: hit };
  },

  enumMap(value, args, ctx) {
    if (isEmpty(value)) return { ok: true, value: null };
    const values = (args.values && typeof args.values === "object" ? args.values : {}) as Record<string, unknown>;
    const key = show(value);
    if (Object.hasOwn(values, key)) return { ok: true, value: values[key] };
    if (args.fallback !== undefined) return { ok: true, value: args.fallback };
    return fail("MAPPING_MISS", `枚举值「${key}」没有对应的目标值`, `在字段「${ctx.target}」的枚举映射里补充「${key}」`);
  },

  concat(value, args, ctx) {
    const sources = Array.isArray(args.sources) ? args.sources.filter((s): s is string => typeof s === "string") : null;
    const separator = stringArg(args, "separator") ?? "";
    const parts = (sources ? sources.map((s) => readPath(ctx.record, s)) : [value]).filter((v) => !isEmpty(v)).map(show);
    return { ok: true, value: parts.length ? parts.join(separator) : null };
  },

  split(value, args) {
    if (isEmpty(value)) return { ok: true, value: null };
    const separator = stringArg(args, "separator") ?? ",";
    let items: unknown[];
    if (Array.isArray(value)) items = value;
    else if (typeof value === "string")
      items = value
        .split(separator)
        .map((s) => s.trim())
        .filter(Boolean);
    else return fail("FORMAT_MISMATCH", `「${show(value)}」不是可拆分的文本`, "检查来源字段类型或去掉 split 转换");
    if (typeof args.index === "number") return { ok: true, value: items[args.index] ?? null };
    return { ok: true, value: items };
  },
};

export function applyTransform(name: SyncTransform, value: unknown, args: Record<string, unknown> = {}, ctx: Partial<TransformContext> = {}): TransformOutcome {
  const fn = transforms[name];
  if (!fn) return fail("FORMAT_MISMATCH", `未知转换「${name}」`, "检查映射配置");
  return fn(value, args, { record: ctx.record ?? {}, codeMaps: ctx.codeMaps ?? {}, source: ctx.source ?? "", target: ctx.target ?? "" });
}

export function applyMapping(fields: SyncMappingField[], codeMaps: SyncCodeMaps, record: Record<string, unknown>): MappingResult {
  if (!fields.length) return { ok: true, output: { ...record }, errors: [] };
  const output: Record<string, unknown> = {};
  const errors: SyncMappingIssue[] = [];
  for (const field of fields) {
    const source = field.source ?? "";
    const raw = readPath(record, source);
    let value: unknown = raw === undefined ? null : raw;
    if (field.transform) {
      const res = applyTransform(field.transform, value, field.args ?? {}, { record, codeMaps, source, target: field.target });
      if (!res.ok) {
        errors.push({ field: field.target, source, type: res.type, message: res.message, suggestion: res.suggestion });
        continue;
      }
      value = res.value;
    }
    if (field.required && isEmpty(value)) {
      errors.push({ field: field.target, source, type: "REQUIRED_MISSING", message: `必填字段「${source || field.target}」为空`, suggestion: "补数据后手动重试" });
      continue;
    }
    output[field.target] = value instanceof Date ? value.toISOString() : value;
  }
  return { ok: errors.length === 0, output, errors };
}
