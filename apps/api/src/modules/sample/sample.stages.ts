import { type RoundStatus, SAMPLE_STAGES, type SampleStage, type StageView } from "@otd/contracts/sample";
import { type DbOrTx, sampleStageLogs, samples, sampleRounds } from "@otd/db";
import { and, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const DEFAULT_AVG_HOURS: Record<SampleStage, number> = { RECEIVING: 12, SOURCING: 48, KNITTING: 24, QC: 24, READY: 12 };
export const AVG_MIN_SAMPLES = 5;
export const AVG_WINDOW_DAYS = 90;

export const STAGE_INDEX: Record<RoundStatus, number> = {
  ISSUED: 0,
  RECEIVING: 1,
  SOURCING: 2,
  KNITTING: 3,
  QC: 4,
  READY: 5,
  SHIPPED: 6,
  AWAITING_APPROVAL: 7,
  APPROVED: 8,
  REVISE: 8,
};

export type StageLogRow = typeof sampleStageLogs.$inferSelect;
export type AvgLookup = (factoryId: string | null, stage: SampleStage) => { hours: number; source: StageView["avgSource"] };

export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round(((to.getTime() - from.getTime()) / HOUR) * 100) / 100);
}

export async function loadAverages(db: DbOrTx, now: Date, excludeRoundIds: string[]): Promise<AvgLookup> {
  const since = new Date(now.getTime() - AVG_WINDOW_DAYS * DAY);
  const conds = [isNotNull(sampleStageLogs.leftAt), gte(sampleStageLogs.leftAt, since), inArray(sampleStageLogs.stage, [...SAMPLE_STAGES]), isNotNull(sampleStageLogs.durationHours)];
  if (excludeRoundIds.length) conds.push(notInArray(sampleStageLogs.roundId, excludeRoundIds));
  const rows = await db
    .select({
      stage: sampleStageLogs.stage,
      factoryId: sampleStageLogs.factoryId,
      total: sql<number>`cast(sum(${sampleStageLogs.durationHours}) as double precision)`,
      n: sql<number>`cast(count(*) as int)`,
    })
    .from(sampleStageLogs)
    .where(and(...conds))
    .groupBy(sampleStageLogs.stage, sampleStageLogs.factoryId);
  const byFactory = new Map<string, { total: number; n: number }>();
  const byStage = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    const total = Number(r.total);
    const n = Number(r.n);
    if (r.factoryId) byFactory.set(`${r.factoryId}:${r.stage}`, { total, n });
    const g = byStage.get(r.stage) ?? { total: 0, n: 0 };
    byStage.set(r.stage, { total: g.total + total, n: g.n + n });
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return (factoryId, stage) => {
    const f = factoryId ? byFactory.get(`${factoryId}:${stage}`) : undefined;
    if (f && f.n >= AVG_MIN_SAMPLES) return { hours: round1(f.total / f.n), source: "FACTORY" };
    const g = byStage.get(stage);
    if (g && g.n >= AVG_MIN_SAMPLES) return { hours: round1(g.total / g.n), source: "GROUP" };
    return { hours: DEFAULT_AVG_HOURS[stage], source: "DEFAULT" };
  };
}

export function buildStages(status: RoundStatus, logs: StageLogRow[], factoryId: string | null, avg: AvgLookup, now: Date, names: Map<string, string>): StageView[] {
  return SAMPLE_STAGES.map((stage) => {
    const ls = logs.filter((l) => l.stage === stage).sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
    const a = avg(factoryId, stage);
    if (!ls.length) return { stage, state: "PENDING", enteredAt: null, completedAt: null, durationHours: null, avgHours: a.hours, avgSource: a.source, slow: false, location: null, operatorName: null, passes: 0 };
    const active = status === stage && ls.some((l) => !l.leftAt);
    let duration = 0;
    for (const l of ls) duration += l.leftAt ? (l.durationHours ?? hoursBetween(l.enteredAt, l.leftAt)) : active ? hoursBetween(l.enteredAt, now) : 0;
    duration = Math.round(duration * 100) / 100;
    const last = ls[ls.length - 1]!;
    const done = !active && ls.every((l) => !!l.leftAt);
    return {
      stage,
      state: active ? "ACTIVE" : done ? "DONE" : "PENDING",
      enteredAt: ls[0]!.enteredAt.toISOString(),
      completedAt: done && last.leftAt ? last.leftAt.toISOString() : null,
      durationHours: duration,
      avgHours: a.hours,
      avgSource: a.source,
      slow: duration > a.hours,
      location: last.location,
      operatorName: last.operatorId ? (names.get(last.operatorId) ?? null) : null,
      passes: ls.length,
    };
  });
}

export function progressOf(status: RoundStatus, stages: StageView[], dueDate: string | null, now: Date): "NORMAL" | "SLOW" {
  const idx = STAGE_INDEX[status];
  if (idx >= STAGE_INDEX.READY) return stages.some((s) => s.state === "ACTIVE" && s.slow) ? "SLOW" : "NORMAL";
  const active = stages.find((s) => s.state === "ACTIVE");
  if (active?.slow) return "SLOW";
  if (!dueDate) return "NORMAL";
  let remaining = 0;
  for (const s of stages) {
    const sIdx = STAGE_INDEX[s.stage];
    if (sIdx < idx) continue;
    if (sIdx === idx) remaining += Math.max(0, s.avgHours - (s.durationHours ?? 0));
    else remaining += s.avgHours;
  }
  const projected = now.getTime() + remaining * HOUR;
  const due = new Date(`${dueDate}T23:59:59.999Z`).getTime();
  return projected > due ? "SLOW" : "NORMAL";
}

export function remainingDays(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;
  return Math.round((new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);
}

export async function currentRounds(db: DbOrTx, sampleIds: string[]) {
  if (!sampleIds.length) return [];
  return db
    .select()
    .from(sampleRounds)
    .where(and(inArray(sampleRounds.sampleId, sampleIds), sql`${sampleRounds.roundNo} = (select max(r2.round_no) from sample_rounds r2 where r2.sample_id = ${sampleRounds.sampleId})`));
}

export const currentRoundStatusIn = (statuses: string[]) =>
  sql`exists (select 1 from sample_rounds r where r.sample_id = ${samples.id} and r.status in (${sql.join(
    statuses.map((s) => sql`${s}`),
    sql`, `,
  )}) and r.round_no = (select max(r2.round_no) from sample_rounds r2 where r2.sample_id = r.sample_id))`;

export const currentRoundTypeIs = (roundType: string) =>
  sql`exists (select 1 from sample_rounds r where r.sample_id = ${samples.id} and r.round_type = ${roundType} and r.round_no = (select max(r2.round_no) from sample_rounds r2 where r2.sample_id = r.sample_id))`;

