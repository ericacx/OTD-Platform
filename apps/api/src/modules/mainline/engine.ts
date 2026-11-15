import { type Label, type MachineKey, NODES, type NodeCode, type NodeState, statusLabel } from "@otd/shared";

export type PlanningFact = { id: string; docNo: string; status: string; seasonCode: string | null; confirmed: boolean };
export type SampleRoundFact = { id: string; sampleId: string; sampleDocNo: string; roundNo: number; roundType: string; status: string };
export type TestRequestFact = { id: string; docNo: string; status: string; result: string | null };
export type TestReportFact = { id: string; docNo: string; agencyReportNo: string; result: string; validUntil: string };
export type QuoteRoundFact = { id: string; quoteId: string; docNo: string; kind: string; roundNo: number; status: string; guardrailPassed: boolean; overrideApproved: boolean };
export type HandoverFact = { id: string; docNo: string; status: string; missing: Label[] };

export type StyleFacts = {
  styleId: string;
  styleNo: string;
  planning: PlanningFact | null;
  costReview: boolean;
  rounds: SampleRoundFact[];
  testRequests: TestRequestFact[];
  testReports: TestReportFact[];
  quoteRounds: QuoteRoundFact[];
  handover: HandoverFact | null;
};

export type RuleCheckFact = { key: string; label: Label; passed: boolean; detail?: string | null; applicable?: boolean };

export type OrderFacts = {
  order: {
    id: string;
    poNo: string;
    status: string;
    ruleCheck: RuleCheckFact[] | null;
    unmatchedStyleNos: string[];
    factoryReplyDate: string | null;
    factoryName: string | null;
    transportMode: string | null;
  };
  styles: StyleFacts[];
  packagingPlans: { id: string; docNo: string; status: string; confirmed: boolean; version: number }[];
  cartons: { id: string; docNo: string; status: string }[];
  purchases: { id: string; docNo: string; status: string; promisedDate: string | null }[];
  production: { completionRate: number | null; reportDate: string } | null;
  inspections: { id: string; docNo: string; stage: string; status: string; result: string | null; roundNo: number; styleId: string | null; releaseCheck: RuleCheckFact[] | null }[];
  bookings: { id: string; docNo: string; status: string }[];
  shipments: { id: string; docNo: string; status: string }[];
  receivables: { id: string; docNo: string; status: string; dueDate: string }[];
  redHits: { node: NodeCode; message: Label }[];
};

export type EngineOptions = {
  today: string;
  enabledNodes?: ReadonlySet<NodeCode> | null;
  features?: { packaging?: boolean; purchase?: boolean };
};

export type NodeResult = {
  code: NodeCode;
  key: string;
  name: Label;
  gate: "G1" | "G2" | null;
  state: NodeState;
  summary: Label;
  blockedReasons: Label[];
  link: string | null;
  parallel: boolean;
  styles: { styleNo: string; state: NodeState }[];
};

export type MainlineResult = {
  nodes: NodeResult[];
  completedCount: number;
  total: number;
  currentNode: NodeCode | null;
  closed: boolean;
  headline: Label;
};

type Part = { state: NodeState; summary: Label; reasons: Label[]; link: string | null };

export const MANDATORY_NODES: readonly NodeCode[] = ["N01", "N02", "N05", "N06", "N08", "N10"];

const AFTER_CONFIRM = new Set(["TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP", "COMPLETED"]);
const PRODUCING = new Set(["IN_PRODUCTION", "TO_SHIP", "COMPLETED"]);
const SHIPPABLE = new Set(["TO_SHIP", "COMPLETED"]);
const QC_REACHED = new Set(["QC", "READY", "SHIPPED", "AWAITING_APPROVAL", "APPROVED"]);
const SETTLED = new Set(["PAID", "OFFSET"]);

const L = (zh: string, en: string): Label => ({ zh, en });
const part = (state: NodeState, summary: Label, link: string | null = null, reasons: Label[] = []): Part => ({ state, summary, reasons, link });
const st = (machine: MachineKey, code: string) => statusLabel(machine, code);
const isFinished = (s: NodeState) => s === "DONE" || s === "NOT_APPLICABLE";

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function n01(s: StyleFacts): Part {
  const p = s.planning;
  if (!p) return part("NOT_STARTED", L(`#${s.styleNo} 尚未接入企划`, `No brief for #${s.styleNo} yet`));
  const link = `/planning/${p.id}`;
  const season = p.seasonCode ? `${p.seasonCode} ` : "";
  if (p.status === "RECOGNITION_FAILED") return part("BLOCKED", L(`企划 ${p.docNo} 识别失败`, `Brief ${p.docNo} recognition failed`), link, [L(`企划 ${p.docNo} 识别失败，需重新识别或手工录入`, `Brief ${p.docNo} recognition failed; retry or enter manually`)]);
  if (p.confirmed || p.status === "CONFIRMED" || p.status === "ARCHIVED") return part("DONE", L(`${season}企划 ${p.docNo} 已确认（#${s.styleNo}）`, `${season}brief ${p.docNo} confirmed (#${s.styleNo})`), link);
  const label = st("planning", p.status);
  return part("IN_PROGRESS", L(`${season}企划 ${p.docNo} ${label.zh}，待业务员复核确认`, `${season}brief ${p.docNo} ${label.en.toLowerCase()}, awaiting review`), link);
}

function latestRounds(rounds: SampleRoundFact[]): SampleRoundFact[] {
  const bySample = new Map<string, SampleRoundFact>();
  for (const r of rounds) {
    const cur = bySample.get(r.sampleId);
    if (!cur || r.roundNo > cur.roundNo) bySample.set(r.sampleId, r);
  }
  return [...bySample.values()];
}

function n02(s: StyleFacts): Part {
  const latest = latestRounds(s.rounds);
  if (!latest.length) {
    if (s.planning && (s.planning.confirmed || s.planning.status === "CONFIRMED" || s.planning.status === "ARCHIVED")) return part("IN_PROGRESS", L("企划已确认，打样指令待下达", "Brief confirmed, sampling to be issued"));
    return part("NOT_STARTED", L("待企划确认后自动下达打样", "Sampling starts after the brief is confirmed"));
  }
  const approved = s.rounds.filter((r) => r.status === "APPROVED").sort((a, b) => b.roundNo - a.roundNo)[0];
  const pending = latest.find((r) => r.status !== "APPROVED");
  if (approved || !pending) {
    const r = approved ?? latest[0]!;
    return part("DONE", L(`打样已批准（${r.sampleDocNo} 第 ${r.roundNo} 轮 ${r.roundType}），按客户规则口径归档`, `Sample approved (${r.sampleDocNo} round ${r.roundNo} ${r.roundType})`), `/samples/${r.sampleId}`);
  }
  const label = st("sampleRound", pending.status);
  const extra = pending.status === "REVISE" ? L("，待下一轮", ", next round pending") : L("", "");
  return part("IN_PROGRESS", L(`${pending.sampleDocNo} 第 ${pending.roundNo} 轮 ${pending.roundType} · ${label.zh}${extra.zh}`, `${pending.sampleDocNo} round ${pending.roundNo} ${pending.roundType} · ${label.en}${extra.en}`), `/samples/${pending.sampleId}`);
}

function n03(s: StyleFacts, today: string): Part {
  const valid = s.testReports.filter((r) => r.result === "PASS" && r.validUntil >= today).sort((a, b) => b.validUntil.localeCompare(a.validUntil));
  if (valid.length) {
    const r = valid[0]!;
    return part("DONE", L(`测试报告 ${r.agencyReportNo} 有效至 ${r.validUntil}，报告复用自动核验`, `Report ${r.agencyReportNo} valid until ${r.validUntil}`), `/tests/reports/${r.id}`);
  }
  const active = s.testRequests.find((r) => r.status !== "COMPLETED");
  if (active) {
    const label = st("testRequest", active.status);
    return part("IN_PROGRESS", L(`送测 ${active.docNo} ${label.zh}`, `Test ${active.docNo} ${label.en.toLowerCase()}`), `/tests/${active.id}`);
  }
  const failedReport = s.testReports.find((r) => r.result === "FAIL");
  const failedRequest = s.testRequests.find((r) => r.status === "COMPLETED" && r.result === "FAIL");
  if (failedReport || failedRequest) {
    const no = failedRequest?.docNo ?? failedReport!.agencyReportNo;
    const link = failedRequest ? `/tests/${failedRequest.id}` : `/tests/reports/${failedReport!.id}`;
    return part("BLOCKED", L(`${no} 测试不合格`, `${no} failed`), link, [L(`${no} 测试不合格，待重测`, `${no} failed, retest required`)]);
  }
  const expired = s.testReports.filter((r) => r.result === "PASS").sort((a, b) => b.validUntil.localeCompare(a.validUntil))[0];
  if (expired) return part("BLOCKED", L(`报告 ${expired.agencyReportNo} 已过期`, `Report ${expired.agencyReportNo} expired`), `/tests/reports/${expired.id}`, [L(`报告 ${expired.agencyReportNo} 已于 ${expired.validUntil} 过期`, `Report ${expired.agencyReportNo} expired on ${expired.validUntil}`)]);
  const done = s.testRequests.find((r) => r.status === "COMPLETED");
  if (done) return part("IN_PROGRESS", L(`送测 ${done.docNo} 已完成，待登记报告`, `Test ${done.docNo} completed, report pending`), `/tests/${done.id}`);
  if (s.rounds.some((r) => QC_REACHED.has(r.status))) return part("IN_PROGRESS", L("打样已到质检，待安排送测", "Sample reached QC, testing to be arranged"), "/tests");
  return part("NOT_STARTED", L("打样进入质检后可并行送测", "Testing can start once sampling reaches QC"));
}

function n04(s: StyleFacts): Part {
  const customer = s.quoteRounds.filter((r) => r.kind === "CUSTOMER").sort((a, b) => b.roundNo - a.roundNo);
  const latest = customer[0];
  if (latest?.status === "ACCEPTED") return part("DONE", L(`报价 ${latest.docNo} 已被客户接受`, `Quote ${latest.docNo} accepted`), `/quotes/${latest.quoteId}`);
  const violated = s.quoteRounds.find((r) => (r.status === "DRAFT" || r.status === "COST_REVIEW") && !r.guardrailPassed && !r.overrideApproved);
  if (violated) return part("BLOCKED", L(`报价 ${violated.docNo} 毛利低于护栏`, `Quote ${violated.docNo} below guardrail`), `/quotes/${violated.quoteId}`, [L(`报价 ${violated.docNo} 毛利低于护栏，待例外审批`, `Quote ${violated.docNo} below guardrail, override approval required`)]);
  if (latest) {
    const label = st("quoteRound", latest.status);
    const hint = latest.status === "QUOTED" ? L("，待客户反馈", ", awaiting customer") : latest.status === "REJECTED" ? L("，待下一轮报价", ", next round pending") : L("", "");
    return part("IN_PROGRESS", L(`报价 ${latest.docNo} ${label.zh}${hint.zh}`, `Quote ${latest.docNo} ${label.en.toLowerCase()}${hint.en}`), `/quotes/${latest.quoteId}`);
  }
  const internal = s.quoteRounds[0];
  if (internal || s.costReview) return part("IN_PROGRESS", L("成本核算中 → 报价待发送客户", "Costing in progress"), internal ? `/quotes/${internal.quoteId}` : "/quotes");
  return part("NOT_STARTED", L("打样进入「成本审核中」后可并行报价", "Quoting can start once costing begins"));
}

function n05(s: StyleFacts, prior: Part[]): Part {
  const h = s.handover;
  const link = h ? `/documents/handovers/${h.id}` : "/documents/handovers";
  if (h?.status === "HANDED_OVER") return part("DONE", L(`五项齐套：样品 + 报价 + 测试 + QRS + 技术资料包，${h.docNo} 已移交冻结`, `5 items complete, ${h.docNo} handed over and frozen`), link);
  if (!prior.every((p) => isFinished(p.state))) return part("NOT_STARTED", L("待打样、测试、报价完成后移交", "Hand over after sampling, testing and quoting"), h ? link : null);
  if (!h) return part("IN_PROGRESS", L("前置环节已完成，待建开发移交包", "Prerequisites done, handover package to be created"), link);
  if (h.missing.length) return part("BLOCKED", L(`${h.docNo} 五项未齐套`, `${h.docNo} incomplete`), link, h.missing.map((m) => L(`G1 缺项：${m.zh}`, `G1 missing: ${m.en}`)));
  return part("IN_PROGRESS", L(`${h.docNo} 五项齐套，待确认移交`, `${h.docNo} complete, awaiting handover`), link);
}

function aggregate(perStyle: { styleNo: string; p: Part }[], empty: Label): Part & { styles: { styleNo: string; state: NodeState }[] } {
  const styles = perStyle.map((x) => ({ styleNo: x.styleNo, state: x.p.state }));
  if (!perStyle.length) return { ...part("NOT_STARTED", empty), styles };
  const multi = perStyle.length > 1;
  const prefix = (styleNo: string, l: Label): Label => (multi ? L(`#${styleNo} ${l.zh}`, `#${styleNo} ${l.en}`) : l);
  const blocked = perStyle.filter((x) => x.p.state === "BLOCKED");
  if (blocked.length) {
    const first = blocked[0]!;
    return { state: "BLOCKED", summary: prefix(first.styleNo, first.p.summary), reasons: blocked.flatMap((x) => x.p.reasons.map((r) => prefix(x.styleNo, r))), link: first.p.link, styles };
  }
  if (perStyle.every((x) => x.p.state === "NOT_APPLICABLE")) return { ...part("NOT_APPLICABLE", L("客户流程未启用此环节", "Not enabled in the customer flow")), styles };
  if (perStyle.every((x) => isFinished(x.p.state))) {
    const summary = multi ? L(`${perStyle.length} 款全部完成`, `All ${perStyle.length} styles done`) : perStyle[0]!.p.summary;
    return { state: "DONE", summary, reasons: [], link: perStyle[0]!.p.link, styles };
  }
  if (perStyle.every((x) => x.p.state === "NOT_STARTED")) return { ...perStyle[0]!.p, summary: prefix(perStyle[0]!.styleNo, perStyle[0]!.p.summary), styles };
  const done = perStyle.filter((x) => isFinished(x.p.state)).length;
  const active = perStyle.find((x) => x.p.state === "IN_PROGRESS") ?? perStyle.find((x) => !isFinished(x.p.state))!;
  const summary = multi ? L(`${done} / ${perStyle.length} 款已完成 · #${active.styleNo} ${active.p.summary.zh}`, `${done} / ${perStyle.length} styles done · #${active.styleNo} ${active.p.summary.en}`) : active.p.summary;
  return { state: "IN_PROGRESS", summary, reasons: [], link: active.p.link, styles };
}

function n06(f: OrderFacts): Part {
  const o = f.order;
  const link = `/orders/${o.id}`;
  if (o.status !== "PENDING_CONFIRM") return part("DONE", L(`PO ${o.poNo} 已复核确认`, `PO ${o.poNo} reviewed and confirmed`), link);
  const reasons: Label[] = [];
  for (const styleNo of o.unmatchedStyleNos) reasons.push(L(`款号 ${styleNo} 未关联开发资料`, `Style ${styleNo} not linked to development data`));
  for (const r of o.ruleCheck ?? []) if (!r.passed) reasons.push(L(`${r.label.zh}${r.detail ? `：${r.detail}` : ""}`, `${r.label.en}${r.detail ? `: ${r.detail}` : ""}`));
  if (reasons.length) return part("BLOCKED", L(`PO ${o.poNo} 待复核 · 规则包有 ${reasons.length} 项未通过`, `PO ${o.poNo} under review · ${reasons.length} rule(s) failed`), link, reasons);
  if (o.ruleCheck?.length) return part("IN_PROGRESS", L(`PO ${o.poNo} 待复核 · 规则包校验全绿，一键确认`, `PO ${o.poNo} under review · all rules passed, confirm in one click`), link);
  return part("IN_PROGRESS", L(`PO ${o.poNo} 待复核`, `PO ${o.poNo} under review`), link);
}

function n07(f: OrderFacts, features: { packaging: boolean; purchase: boolean }): Part {
  const confirmed = f.packagingPlans.find((p) => p.confirmed);
  const plan = confirmed ?? f.packagingPlans[0];
  const purchases = f.purchases.filter((p) => p.status !== "CANCELLED");
  const link = plan ? `/packaging/${plan.id}` : purchases[0] ? `/purchases/${purchases[0].id}` : "/packaging";
  if (!AFTER_CONFIRM.has(f.order.status)) return part("NOT_STARTED", L("物料清单展开用料需求 · 包装通知单待确认", "Material requirements and packing notice pending"));
  if (SHIPPABLE.has(f.order.status) && !(confirmed || !features.packaging)) return part("DONE", L("订单已进入待发货，辅料与包装视为完成", "Order ready to ship; trims & packing treated as done"), link);
  const packOk = !features.packaging || !!confirmed;
  const purchaseOk = !features.purchase || purchases.length > 0;
  const packText = !features.packaging ? L("", "") : confirmed ? L(`包装方案 ${confirmed.docNo} v${confirmed.version} 已确认`, `Packing ${confirmed.docNo} v${confirmed.version} confirmed`) : plan ? L(`包装方案 ${plan.docNo} ${st("packagingPlan", plan.status).zh}`, `Packing ${plan.docNo} ${st("packagingPlan", plan.status).en.toLowerCase()}`) : L("包装方案未建立", "No packing plan");
  const buyText = !features.purchase ? L("", "") : purchases.length ? L(`采购单 ${purchases.length} 张已下达`, `${purchases.length} purchase order(s) placed`) : L("采购单未下达", "No purchase order");
  const summary = L([packText.zh, buyText.zh].filter(Boolean).join(" · "), [packText.en, buyText.en].filter(Boolean).join(" · "));
  if ((packOk && purchaseOk) || SHIPPABLE.has(f.order.status)) return part("DONE", summary, link);
  return part("IN_PROGRESS", summary, link);
}

function n08(f: OrderFacts, today: string, features: { packaging: boolean }): Part {
  const o = f.order;
  const link = `/orders/${o.id}?tab=production`;
  const factory = o.factoryName ? `${o.factoryName}承做` : "承做工厂待定";
  const factoryEn = o.factoryName ? `Made by ${o.factoryName}` : "Factory TBD";
  if (!PRODUCING.has(o.status)) return part("NOT_STARTED", L(`${factory} · 生产排程与在制任务在此跟进`, `${factoryEn} · scheduling and WIP tracked here`));
  const rate = f.production?.completionRate ?? 0;
  const pct = `${Math.round(rate * 100)}%`;
  const cartonsReady = !features.packaging || (f.cartons.length > 0 && f.cartons.every((c) => c.status === "PACKED"));
  if (SHIPPABLE.has(o.status)) return part("DONE", L(`${factory} · 生产完成`, `${factoryEn} · production complete`), link);
  if (rate >= 1 && cartonsReady) return part("DONE", L(`${factory} · 生产完成率 100%，装箱单齐套`, `${factoryEn} · 100% produced, cartons complete`), link);
  const reasons: Label[] = [];
  for (const p of f.purchases) {
    if ((p.status === "ORDERED" || p.status === "PARTIAL") && p.promisedDate && p.promisedDate < today) reasons.push(L(`采购单 ${p.docNo} 承诺交期 ${p.promisedDate} 已过未到货`, `Purchase ${p.docNo} overdue since ${p.promisedDate}`));
  }
  if (!o.factoryReplyDate) reasons.push(L("工厂交期回复缺失", "Factory due-date reply missing"));
  const cartonText = rate >= 1 && !cartonsReady ? L("，装箱单未齐套", ", cartons incomplete") : L("", "");
  const summary = L(`${factory} · 生产完成率 ${pct}${cartonText.zh}`, `${factoryEn} · ${pct} produced${cartonText.en}`);
  return part(reasons.length ? "BLOCKED" : "IN_PROGRESS", summary, link, reasons);
}

function n09(f: OrderFacts): Part {
  const insp = f.inspections.filter((i) => i.status !== "CANCELLED");
  const released = insp.filter((i) => i.status === "RELEASED");
  const styleIds = f.styles.map((s) => s.styleId);
  const covered = released.some((i) => !i.styleId) || (styleIds.length > 0 && styleIds.every((id) => released.some((i) => i.styleId === id)));
  const first = released[0] ?? insp[0];
  const link = first ? `/inspections/${first.id}` : "/inspections";
  if ((released.length && covered) || SHIPPABLE.has(f.order.status)) {
    return part("DONE", released.length ? L(`验货 ${released.map((r) => r.docNo).join("、")} 已放行（G2 三条件满足）`, `Inspection ${released.map((r) => r.docNo).join(", ")} released`) : L("订单已进入待发货，验货已放行", "Order ready to ship; released"), link);
  }
  const started = insp.filter((i) => i.status !== "TO_SCHEDULE");
  if (!started.length) return part("NOT_STARTED", L("初验 / 中验 / 尾验按计划执行；三条件缺一不放行", "IPI / DPI / FRI as planned; release needs all 3 conditions"), insp[0] ? link : null);
  const reasons: Label[] = [];
  const finals = started.filter((i) => i.stage === "FRI");
  const latestFinal = new Map<string, (typeof finals)[number]>();
  for (const i of finals) {
    const key = i.styleId ?? "*";
    const cur = latestFinal.get(key);
    if (!cur || i.roundNo > cur.roundNo) latestFinal.set(key, i);
  }
  let blockLink: string | null = null;
  for (const i of latestFinal.values()) {
    if (i.status === "INSPECTED" && i.result === "FAIL") {
      reasons.push(L(`${i.docNo} 尾验第 ${i.roundNo} 轮不合格，待整改复验`, `${i.docNo} FRI round ${i.roundNo} failed, rework required`));
      blockLink ??= `/inspections/${i.id}`;
    } else if (i.status === "INSPECTED" && i.releaseCheck?.some((c) => !c.passed && c.applicable !== false)) {
      for (const c of i.releaseCheck.filter((x) => !x.passed && x.applicable !== false)) reasons.push(L(`G2 未满足：${c.label.zh}${c.detail ? `（${c.detail}）` : ""}`, `G2 not met: ${c.label.en}${c.detail ? ` (${c.detail})` : ""}`));
      blockLink ??= `/inspections/${i.id}`;
    }
  }
  if (reasons.length) return part("BLOCKED", L("验货未放行", "Not released"), blockLink ?? link, reasons);
  const cur = [...latestFinal.values()][0] ?? started[started.length - 1]!;
  const label = st("inspection", cur.status);
  return part("IN_PROGRESS", L(`验货 ${cur.docNo}（${cur.stage}）${label.zh}`, `Inspection ${cur.docNo} (${cur.stage}) ${label.en.toLowerCase()}`), `/inspections/${cur.id}`);
}

function n10(f: OrderFacts, today: string): Part {
  const o = f.order;
  const transport = o.transportMode ?? "";
  if (o.status === "COMPLETED") return part("DONE", L("全部出货已签收，回款闭环", "All shipments signed and settled"), f.shipments[0] ? `/shipments/${f.shipments[0].id}` : `/receivables`);
  if (!f.shipments.length && !f.bookings.length) return part("NOT_STARTED", L(`${transport ? `${transport} · ` : ""}订舱、出运与收款在此闭环`, `${transport ? `${transport} · ` : ""}booking, shipping and collection close here`));
  const reasons: Label[] = [];
  for (const r of f.receivables) {
    if (!SETTLED.has(r.status) && r.status !== "OFFSET_PENDING" && r.dueDate < today) reasons.push(L(`应收 ${r.docNo} 逾期 ${daysBetween(r.dueDate, today)} 天`, `Receivable ${r.docNo} overdue ${daysBetween(r.dueDate, today)} days`));
  }
  const allSigned = f.shipments.length > 0 && f.shipments.every((s) => s.status === "SIGNED");
  const allPaid = f.receivables.length > 0 && f.receivables.every((r) => SETTLED.has(r.status));
  const ship = f.shipments.find((s) => s.status !== "SIGNED") ?? f.shipments[0];
  const link = ship ? `/shipments/${ship.id}` : f.receivables[0] ? `/receivables/${f.receivables[0].id}` : "/shipments/bookings";
  if (allSigned && allPaid) return part("DONE", L("全部出货已签收，应收已收齐", "All shipments signed and receivables settled"), link);
  const shipText = ship ? L(`出货 ${ship.docNo} ${st("shipment", ship.status).zh}`, `Shipment ${ship.docNo} ${st("shipment", ship.status).en.toLowerCase()}`) : L(`订舱 ${f.bookings[0]!.docNo} 已建`, `Booking ${f.bookings[0]!.docNo} created`);
  const open = f.receivables.filter((r) => !SETTLED.has(r.status)).length;
  const arText = allSigned ? (f.receivables.length ? L(`应收 ${open} 张待收`, `${open} receivable(s) open`) : L("待生成应收", "Receivable pending")) : L("", "");
  const summary = L([shipText.zh, arText.zh].filter(Boolean).join(" · "), [shipText.en, arText.en].filter(Boolean).join(" · "));
  return part(reasons.length ? "BLOCKED" : "IN_PROGRESS", summary, link, reasons);
}

export function deriveMainline(facts: OrderFacts, options: EngineOptions): MainlineResult {
  const today = options.today;
  const enabled = (code: NodeCode) => !options.enabledNodes || MANDATORY_NODES.includes(code) || options.enabledNodes.has(code);
  const features = { packaging: options.features?.packaging ?? true, purchase: options.features?.purchase ?? true };
  const na = part("NOT_APPLICABLE", L("客户流程未启用此环节", "Not enabled in the customer flow"));

  const perStyle = facts.styles.map((s) => {
    const handedOver = s.handover?.status === "HANDED_OVER";
    const reuse = (p: Part): Part => (handedOver && (p.state === "NOT_STARTED" || p.state === "IN_PROGRESS") ? part("DONE", L(`沿用已移交开发资料（${s.handover!.docNo}）`, `Reusing handed-over data (${s.handover!.docNo})`), p.link ?? `/documents/handovers/${s.handover!.id}`) : p);
    const p1 = reuse(n01(s));
    const p2 = reuse(n02(s));
    const p3 = enabled("N03") ? reuse(n03(s, today)) : na;
    const p4 = enabled("N04") ? reuse(n04(s)) : na;
    const p5 = n05(s, [p2, p3, p4]);
    return { styleNo: s.styleNo, parts: [p1, p2, p3, p4, p5] };
  });

  const empty = L("订单未关联款", "No styles linked");
  const devParts = [0, 1, 2, 3, 4].map((i) => aggregate(perStyle.map((x) => ({ styleNo: x.styleNo, p: x.parts[i]! })), empty));
  const orderParts: Part[] = [
    n06(facts),
    enabled("N07") ? n07(facts, features) : na,
    n08(facts, today, features),
    enabled("N09") ? n09(facts) : na,
    n10(facts, today),
  ];

  const cancelled = facts.order.status === "CANCELLED";
  const nodes: NodeResult[] = NODES.map((def, idx) => {
    const p: Part & { styles?: { styleNo: string; state: NodeState }[] } = idx < 5 ? devParts[idx]! : orderParts[idx - 5]!;
    let state = p.state;
    let summary = p.summary;
    let reasons = p.reasons;
    if (cancelled && idx >= 5 && state !== "DONE" && state !== "NOT_APPLICABLE") {
      state = "NOT_STARTED";
      summary = L("订单已取消", "Order cancelled");
      reasons = [];
    }
    const hits = facts.redHits.filter((h) => h.node === def.code);
    if (hits.length && (state === "IN_PROGRESS" || state === "BLOCKED")) {
      state = "BLOCKED";
      reasons = [...reasons, ...hits.map((h) => h.message)];
    }
    const gate = "gate" in def ? (def.gate as "G1" | "G2") : null;
    return { code: def.code, key: def.key, name: def.label, gate, state, summary, blockedReasons: reasons, link: p.link, parallel: false, styles: idx < 5 ? (p.styles ?? []) : [] };
  });

  const completedCount = nodes.filter((n) => isFinished(n.state)).length;
  const current = cancelled ? undefined : nodes.find((n) => n.state === "IN_PROGRESS" || n.state === "BLOCKED");
  const parallel = current ? nodes.filter((n) => n.code > current.code && (n.state === "IN_PROGRESS" || n.state === "BLOCKED")) : [];
  for (const n of parallel) n.parallel = true;
  const closed = completedCount === nodes.length;
  const parallelNote = parallel.length ? L(`（并行：${parallel.map((n) => n.name.zh).join("、")}）`, ` (parallel: ${parallel.map((n) => n.name.en).join(", ")})`) : L("", "");
  const headline = cancelled
    ? L(`订单已取消 · 已完成 ${completedCount} / 10 步`, `Order cancelled · ${completedCount} / 10 done`)
    : closed
      ? L("已完成 10 / 10 · 已闭环", "Done 10 / 10 · closed")
      : current
        ? L(`已完成 ${completedCount} / 10 步 · 当前节点：${current.name.zh}${parallelNote.zh}`, `Done ${completedCount} / 10 · current: ${current.name.en}${parallelNote.en}`)
        : L(`已完成 ${completedCount} / 10 步 · 等待下一节点启动`, `Done ${completedCount} / 10 · waiting for next node`);
  return { nodes, completedCount, total: nodes.length, currentNode: current?.code ?? null, closed, headline };
}
