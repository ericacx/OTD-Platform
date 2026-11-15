import { DEFAULT_FLOW_PARAMS, type FlowDiffDto, type FlowParams } from "@otd/contracts/flow";
import type { FlowSnapshot, ServiceItemEffect } from "@otd/db";
import { GATES, type GateCode, NODES, type NodeCode } from "@otd/shared";

export const NODE_ORDER: NodeCode[] = NODES.map((n) => n.code);
export const GATE_CODES: GateCode[] = ["G1", "G2"];

const GATE_NODE: Record<GateCode, NodeCode> = { G1: "N05", G2: "N09" };

const CONDITION_CARRIER: Record<GateCode, Record<string, NodeCode | null>> = {
  G1: { sampleApproved: "N02", quoteAccepted: "N04", testReportValid: "N03", qrsRetained: null, techPackUploaded: "N01" },
  G2: { finalPassed: "N09", reportsValid: "N03", packingReady: null },
};

export type EffectLookup = (itemCode: string) => ServiceItemEffect | undefined;

export type RuntimeCore = {
  nodes: NodeCode[];
  gateConditions: Record<GateCode, string[]>;
  modules: string[];
  items: string[];
};

export function allConditions(): Record<GateCode, string[]> {
  return { G1: GATES.G1.conditions.map((c) => c.key), G2: GATES.G2.conditions.map((c) => c.key) };
}

export function computeRuntime(snapshot: FlowSnapshot, lookup: EffectLookup): RuntimeCore {
  const itemNodes = new Set<string>();
  const explicit = new Set<string>();
  const items: string[] = [];
  const modules = sortedModules(snapshot);
  for (const m of modules) {
    for (const it of m.items) {
      items.push(it.itemCode);
      const eff = it.effects ?? lookup(it.itemCode) ?? {};
      for (const n of eff.nodes ?? []) itemNodes.add(n);
      for (const g of eff.gateConditions ?? []) explicit.add(g);
    }
  }
  const gateConditions: Record<GateCode, string[]> = { G1: [], G2: [] };
  for (const gate of GATE_CODES) {
    for (const c of GATES[gate].conditions) {
      const carrier = CONDITION_CARRIER[gate][c.key];
      if (explicit.has(`${gate}.${c.key}`) || (carrier !== null && carrier !== undefined && itemNodes.has(carrier))) gateConditions[gate].push(c.key);
    }
  }
  const nodes = new Set<string>(itemNodes);
  for (const gate of GATE_CODES) if (gateConditions[gate].length) nodes.add(GATE_NODE[gate]);
  return { nodes: NODE_ORDER.filter((n) => nodes.has(n)), gateConditions, modules: modules.map((m) => m.moduleCode), items };
}

export function allOnRuntime(): RuntimeCore {
  return { nodes: [...NODE_ORDER], gateConditions: allConditions(), modules: [], items: [] };
}

export function effectiveParams(params: Record<string, unknown> | undefined | null, paymentTermsDays: number): FlowParams {
  return { ...DEFAULT_FLOW_PARAMS, paymentTermsDays, ...(params ?? {}) } as FlowParams;
}

export function sortedModules(snapshot: FlowSnapshot): FlowSnapshot["modules"] {
  return [...snapshot.modules].sort((a, b) => a.sort - b.sort);
}

export function stripEffects(snapshot: FlowSnapshot): FlowSnapshot {
  return {
    modules: sortedModules(snapshot).map((m, i) => ({ moduleCode: m.moduleCode, sort: i + 1, department: m.department, items: m.items.map((it) => (it.params ? { itemCode: it.itemCode, params: it.params } : { itemCode: it.itemCode })) })),
    params: { ...snapshot.params },
  };
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export type DiffSide = {
  label: string;
  versionId: string | null;
  versionNo: number | null;
  snapshot: FlowSnapshot;
  params: FlowParams;
  runtime: RuntimeCore;
};

export type NameLookup = { module: (code: string) => string; item: (code: string) => string };

export function diffFlows(from: DiffSide, to: DiffSide, names: NameLookup): FlowDiffDto {
  const fromMods = sortedModules(from.snapshot);
  const toMods = sortedModules(to.snapshot);
  const fromCodes = fromMods.map((m) => m.moduleCode);
  const toCodes = toMods.map((m) => m.moduleCode);
  const modulesAdded = toCodes.filter((c) => !fromCodes.includes(c)).map((c) => ({ moduleCode: c, name: names.module(c) }));
  const modulesRemoved = fromCodes.filter((c) => !toCodes.includes(c)).map((c) => ({ moduleCode: c, name: names.module(c) }));
  const commonFrom = fromCodes.filter((c) => toCodes.includes(c));
  const commonTo = toCodes.filter((c) => fromCodes.includes(c));
  const orderChanged = commonFrom.join("|") !== commonTo.join("|");
  const departmentsChanged: FlowDiffDto["departmentsChanged"] = [];
  const itemsAdded: FlowDiffDto["itemsAdded"] = [];
  const itemsRemoved: FlowDiffDto["itemsRemoved"] = [];
  const itemParamsChanged: FlowDiffDto["itemParamsChanged"] = [];
  for (const code of commonTo) {
    const a = fromMods.find((m) => m.moduleCode === code)!;
    const b = toMods.find((m) => m.moduleCode === code)!;
    if (a.department !== b.department) departmentsChanged.push({ moduleCode: code, name: names.module(code), from: a.department, to: b.department });
    const aItems = new Map(a.items.map((i) => [i.itemCode, i]));
    const bItems = new Map(b.items.map((i) => [i.itemCode, i]));
    for (const [ic, it] of bItems) {
      const before = aItems.get(ic);
      if (!before) itemsAdded.push({ moduleCode: code, itemCode: ic, name: names.item(ic) });
      else if (stableStringify(before.params ?? {}) !== stableStringify(it.params ?? {})) itemParamsChanged.push({ moduleCode: code, itemCode: ic, name: names.item(ic) });
    }
    for (const ic of aItems.keys()) if (!bItems.has(ic)) itemsRemoved.push({ moduleCode: code, itemCode: ic, name: names.item(ic) });
  }
  const paramsChanged: FlowDiffDto["paramsChanged"] = [];
  const keys = [...new Set([...Object.keys(from.params), ...Object.keys(to.params)])].sort();
  for (const key of keys) {
    const a = (from.params as Record<string, unknown>)[key];
    const b = (to.params as Record<string, unknown>)[key];
    if (stableStringify(a) !== stableStringify(b)) paramsChanged.push({ key, from: a ?? null, to: b ?? null });
  }
  const nodesAdded = to.runtime.nodes.filter((n) => !from.runtime.nodes.includes(n));
  const nodesRemoved = from.runtime.nodes.filter((n) => !to.runtime.nodes.includes(n));
  const gateConditionsAdded: FlowDiffDto["gateConditionsAdded"] = [];
  const gateConditionsRemoved: FlowDiffDto["gateConditionsRemoved"] = [];
  for (const gate of GATE_CODES) {
    for (const k of to.runtime.gateConditions[gate]) if (!from.runtime.gateConditions[gate].includes(k)) gateConditionsAdded.push({ gate, key: k });
    for (const k of from.runtime.gateConditions[gate]) if (!to.runtime.gateConditions[gate].includes(k)) gateConditionsRemoved.push({ gate, key: k });
  }
  const identical =
    !modulesAdded.length && !modulesRemoved.length && !orderChanged && !departmentsChanged.length && !itemsAdded.length && !itemsRemoved.length && !itemParamsChanged.length && !paramsChanged.length;
  return {
    from: { label: from.label, versionId: from.versionId, versionNo: from.versionNo },
    to: { label: to.label, versionId: to.versionId, versionNo: to.versionNo },
    identical,
    modulesAdded,
    modulesRemoved,
    orderChanged,
    order: { from: fromCodes, to: toCodes },
    departmentsChanged,
    itemsAdded,
    itemsRemoved,
    itemParamsChanged,
    paramsChanged,
    nodesAdded,
    nodesRemoved,
    gateConditionsAdded,
    gateConditionsRemoved,
  };
}

export function diffSummary(diff: FlowDiffDto): Record<string, unknown> {
  return {
    modulesAdded: diff.modulesAdded.map((m) => m.moduleCode),
    modulesRemoved: diff.modulesRemoved.map((m) => m.moduleCode),
    orderChanged: diff.orderChanged,
    departmentsChanged: diff.departmentsChanged.map((d) => d.moduleCode),
    itemsAdded: diff.itemsAdded.map((i) => i.itemCode),
    itemsRemoved: diff.itemsRemoved.map((i) => i.itemCode),
    paramsChanged: diff.paramsChanged.map((p) => p.key),
    nodesAdded: diff.nodesAdded,
    nodesRemoved: diff.nodesRemoved,
  };
}

export function itemCount(snapshot: FlowSnapshot): number {
  return snapshot.modules.reduce((n, m) => n + m.items.length, 0);
}
