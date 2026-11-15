import type { PatrolJudgeKind, PatrolLight, PatrolSeverity } from "@otd/contracts/patrol";
import type { DbOrTx } from "@otd/db";
import { type SQL, inArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export const DAY_MS = 86_400_000;

export type Bilingual = { zh: string; en: string };

export type RuleParams = { thresholdDays: number; yellowWindowDays: number; severity: PatrolSeverity };

export type RuleScope = {
  customerIds: string[] | null;
  g2Conditions: (customerId: string, flowVersionId: string | null) => Promise<string[]>;
};

export type CandidateBase = {
  targetId: string;
  targetNo: string | null;
  targetName: string | null;
  docType: string | null;
  docId: string | null;
  link: string | null;
  customerId: string | null;
  ownerId: string | null;
  orgId: string | null;
  orderId: string | null;
  responsibleIds: string[];
  assigneeId: string | null;
};

export type PatrolCandidate<F = Record<string, unknown>> = CandidateBase & { facts: F };

export type PatrolJudgement = {
  light: PatrolLight;
  severity: PatrolSeverity;
  overdueDays: number;
  message: Bilingual;
  assigneeId: string | null;
};

export type PatrolRuleDefinition<F = Record<string, unknown>> = {
  ruleType: string;
  targetType: string;
  kind: PatrolJudgeKind;
  condition: (params: RuleParams) => Bilingual;
  findCandidates: (db: DbOrTx, params: RuleParams, now: Date, scope: RuleScope) => Promise<PatrolCandidate<F>[]>;
  judge: (candidate: PatrolCandidate<F>, params: RuleParams, now: Date) => PatrolJudgement | null;
};

export function defineRule<F>(def: PatrolRuleDefinition<F>): PatrolRuleDefinition<F> {
  return def;
}

export function todayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function elapsedDays(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

export function shortDate(date: string): string {
  return date.slice(5);
}

const SEVERITY_UP: Record<PatrolSeverity, PatrolSeverity> = { LOW: "MEDIUM", MEDIUM: "HIGH", HIGH: "HIGH" };

export function escalate(severity: PatrolSeverity, light: PatrolLight, overdueDays: number, threshold: number): PatrolSeverity {
  return light === "RED" && threshold > 0 && overdueDays > 2 * threshold ? SEVERITY_UP[severity] : severity;
}

export function dwellLight(days: number, threshold: number, window: number): { light: PatrolLight; overdueDays: number } | null {
  if (days > threshold) return { light: "RED", overdueDays: days - threshold };
  if (window > 0 && days >= 1 && days > threshold - window) return { light: "YELLOW", overdueDays: days - threshold };
  return null;
}

export function deadlineLight(today: string, deadline: string, window: number): { light: PatrolLight; overdueDays: number } | null {
  const left = daysBetween(today, deadline);
  if (left < 0) return { light: "RED", overdueDays: -left };
  if (left <= window) return { light: "YELLOW", overdueDays: -left };
  return null;
}

export function judged(candidate: CandidateBase, params: RuleParams, hit: { light: PatrolLight; overdueDays: number }, message: Bilingual, threshold = params.thresholdDays): PatrolJudgement {
  return { light: hit.light, severity: escalate(params.severity, hit.light, hit.overdueDays, threshold), overdueDays: hit.overdueDays, message, assigneeId: candidate.assigneeId };
}

export function customerIn(column: PgColumn, scope: RuleScope): SQL {
  if (!scope.customerIds) return sql`true`;
  return scope.customerIds.length ? inArray(column, scope.customerIds) : sql`false`;
}

export function compact(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => !!x))];
}

export function base(input: Partial<CandidateBase> & { targetId: string }): CandidateBase {
  return {
    targetNo: null,
    targetName: null,
    docType: null,
    docId: null,
    link: null,
    customerId: null,
    ownerId: null,
    orgId: null,
    orderId: null,
    responsibleIds: [],
    assigneeId: null,
    ...input,
  };
}
