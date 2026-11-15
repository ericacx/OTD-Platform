import { GATES, NODES, pickLabel, type GateCode } from "@otd/shared";

export const NODE_CODES = NODES.map((n) => n.code);

export function nodeLabel(code: string, lang: string): string {
  const node = NODES.find((n) => n.code === code);
  return node ? pickLabel(node.label, lang) : code;
}

export function gateConditionLabel(gate: string, key: string, lang: string): string {
  const def = GATES[gate as GateCode]?.conditions.find((c) => c.key === key);
  return def ? pickLabel(def.label, lang) : key;
}

export const GATE_CONDITION_CODES: { gate: GateCode; key: string; code: string }[] = (["G1", "G2"] as const).flatMap(
  (gate) => GATES[gate].conditions.map((c) => ({ gate, key: c.key, code: `${gate}.${c.key}` })),
);

export const RULE_KIND_KEYS = {
  PO_REVIEW: "KIND_PO_REVIEW",
  RELEASE: "KIND_RELEASE",
  TEST_REUSE: "KIND_TEST_REUSE",
  QUOTE: "KIND_QUOTE",
} as const;

export const DEPARTMENTS = ["业务部", "技术部", "品质部", "计划部", "采购部", "生产部", "关务部", "财务部"];

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
