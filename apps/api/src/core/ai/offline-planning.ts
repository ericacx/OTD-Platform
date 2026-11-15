import { type AiExtractedField, PLANNING_FIELDS, PRODUCT_ATTR_KEYS, type PlanningExtraction, type PlanningField, type ProductAttrKey } from "@otd/contracts/planning";
import type { AiExtractRequest } from "./ai.types.js";
import { extractPdfText } from "./pdf-text.js";

type Rule = { re: RegExp; map?: (m: RegExpExecArray) => string | null };

const SEASONS: Record<string, string> = { fall: "FA", autumn: "FA", spring: "SP", summer: "SU", holiday: "HO", "spring/summer": "SS", "autumn/winter": "AW", "fall/winter": "AW" };
const WEIGHTS: Record<string, string> = { light: "Light 薄款", medium: "Medium 中厚", heavy: "Heavy 厚款" };
const line = (label: string, max = 80) => new RegExp(`(?:${label})\\s*[:：]\\s*([^\\n]{1,${max}})`, "i");
const first = (m: RegExpExecArray) => m[1]?.trim() || null;

const FIELD_RULES: Partial<Record<PlanningField, Rule[]>> = {
  styleNo: [{ re: /(?:style\s*(?:no\.?|number|#)|款号)\s*[:：#]?\s*#?([A-Z0-9][A-Z0-9-]{3,11})/i }, { re: /#(\d{4,6})\b/ }],
  seasonCode: [
    { re: /\b(SS|SP|SU|FA|AW|HO)\s?['’]?(\d{2})\b/, map: (m) => `${m[1]}${m[2]}` },
    { re: /\b(spring\/summer|autumn\/winter|fall\/winter|fall|autumn|spring|summer|holiday)\s+20(\d{2})\b/i, map: (m) => `${SEASONS[m[1]!.toLowerCase()]}${m[2]}` },
  ],
  nameZh: [{ re: line("中文名称|品名", 60) }],
  nameEn: [{ re: line("style\\s*name|product\\s*name|description", 120) }],
  customerName: [{ re: line("customer|brand|client|客户", 60) }],
  category: [
    { re: /\b(women'?s?|ladies)\b/i, map: () => "WOMEN" },
    { re: /\b(kids?|youth|toddler|children)\b/i, map: () => "KIDS" },
    { re: /\bmen'?s?\b/i, map: () => "MEN" },
  ],
  subCategory: [
    { re: /\bno[\s-]?show\b/i, map: () => "NO_SHOW" },
    { re: /\bhalf[\s-]?calf\b/i, map: () => "HALF_CALF" },
    { re: /\bquarter\b/i, map: () => "QUARTER" },
    { re: /\bankle\b/i, map: () => "ANKLE" },
    { re: /\bcrew\b/i, map: () => "CREW" },
  ],
  sizeRange: [{ re: line("sizes?|size\\s*range|尺码段", 40) }, { re: /\b((?:XS|S)\s*\/\s*M\s*\/\s*L(?:\s*\/\s*XL)?)\b/ }],
  defaultSize: [{ re: line("sample\\s*size|default\\s*size|默认尺码", 20) }],
  needleCount: [{ re: /(?:needle\s*count|针数)\s*[:：]?\s*(\d{2,3})\s*N?\b/i, map: (m) => `${m[1]}N` }, { re: /\b(96|120|144|168|200)\s*N\b/, map: (m) => `${m[1]}N` }],
  sockWeight: [{ re: /\b(light|medium|heavy)(?:\s*weight)?\b/i, map: (m) => WEIGHTS[m[1]!.toLowerCase()] ?? null }],
  requiredSampleDate: [
    {
      re: /(?:sample\s*due|proto\s*due|required\s*(?:sample\s*)?date|要求样期)\s*[:：]?\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/i,
      map: (m) => `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`,
    },
  ],
  supplier: [{ re: line("supplier|vendor|指定供应商", 60) }],
  buyerName: [{ re: line("buyer|采购负责人", 40) }],
  designer: [{ re: line("designer|设计", 40) }],
};

const FILENAME_RULES: Partial<Record<PlanningField, Rule[]>> = {
  styleNo: [{ re: /(?:^|\s)#?(\d{5,6})(?=\s|$)/ }],
};

const ATTR_RULES: Record<ProductAttrKey, RegExp[]> = {
  needleCount: [/(?:needle\s*count)\s*[:：]?\s*([^\n]{1,40})/i],
  cylinder: [line("cylinder", 60)],
  nahmSize: [line("NAHM(?:\\s*size)?", 60)],
  cuff: [line("cuff", 80)],
  footCushion: [line("foot\\s*cushion|cushion", 80)],
  heel: [line("heel", 80)],
  toeSeam: [line("toe\\s*seam|toe\\s*closing|toe", 80)],
  leftRight: [line("left\\s*\\/\\s*right(?:\\s*sock)?|L\\/R", 60)],
};

const empty = (): AiExtractedField => ({ value: null, confidence: 0, source: null, page: null });

function documentText(req: AiExtractRequest<unknown>): string {
  const doc = req.document;
  if (!doc) return "";
  if (doc.contentType === "application/pdf") return extractPdfText(doc.data);
  if (doc.contentType.startsWith("text/")) return doc.data.toString("utf8").slice(0, 20000);
  return "";
}

function apply(rules: Rule[], text: string, confidence: number, source: (m: RegExpExecArray) => string): AiExtractedField | null {
  for (const rule of rules) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const value = rule.map ? rule.map(m) : first(m);
    if (value) return { value, confidence, source: source(m), page: null };
  }
  return null;
}

export function offlinePlanningExtract(req: AiExtractRequest<unknown>): PlanningExtraction {
  const filename = req.document?.filename ?? "";
  const body = [req.text ?? "", documentText(req)].join("\n");
  const fileText = filename.replace(/[_]+/g, " ").replace(/\.[a-z0-9]+$/i, "");
  const fields = {} as Record<PlanningField, AiExtractedField>;
  for (const key of PLANNING_FIELDS) {
    const rules = FIELD_RULES[key] ?? [];
    fields[key] = apply(rules, body, 0.6, (m) => m[0].trim().slice(0, 80)) ?? apply([...rules, ...(FILENAME_RULES[key] ?? [])], fileText, 0.4, () => `文件名：${filename}`) ?? empty();
  }
  const productAttrs = PRODUCT_ATTR_KEYS.map((key) => {
    for (const re of ATTR_RULES[key]) {
      const m = re.exec(body);
      const value = m ? first(m) : null;
      if (value) return { key, original: value, translated: value, confidence: 0.5, page: null };
    }
    return { key, original: null, translated: null, confidence: 0, page: null };
  });
  return { fields, productAttrs, briefTranslation: null };
}
