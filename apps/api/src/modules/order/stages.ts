import { ORDER_STAGES, ORDER_STAGE_DEFAULT_DAYS, type OrderStageDto, type StageLogDto } from "@otd/contracts/order";
import { type DbOrTx, orderStageLogs } from "@otd/db";
import { asc, gte } from "drizzle-orm";

type Stage = (typeof ORDER_STAGES)[number];
type LogRow = { orderId: string; status: string; at: Date };

const DAY_MS = 86_400_000;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function stageIntervals(logs: LogRow[]): { status: string; enteredAt: Date; leftAt: Date | null }[] {
  const out: { status: string; enteredAt: Date; leftAt: Date | null }[] = [];
  for (const log of logs) {
    const last = out[out.length - 1];
    if (last && last.status === log.status) continue;
    if (last) last.leftAt = log.at;
    out.push({ status: log.status, enteredAt: log.at, leftAt: null });
  }
  return out;
}

export async function stageAverages(db: DbOrTx, now: Date): Promise<Record<Stage, number | null>> {
  const since = new Date(now.getTime() - 180 * DAY_MS);
  const rows = await db.select({ orderId: orderStageLogs.orderId, status: orderStageLogs.status, at: orderStageLogs.at }).from(orderStageLogs).where(gte(orderStageLogs.at, since)).orderBy(asc(orderStageLogs.orderId), asc(orderStageLogs.at));
  const byOrder = new Map<string, LogRow[]>();
  for (const r of rows) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);
  const sums = new Map<string, { total: number; n: number }>();
  const cutoff = now.getTime() - 90 * DAY_MS;
  for (const logs of byOrder.values()) {
    for (const i of stageIntervals(logs)) {
      if (!i.leftAt || i.leftAt.getTime() < cutoff) continue;
      const cur = sums.get(i.status) ?? { total: 0, n: 0 };
      cur.total += (i.leftAt.getTime() - i.enteredAt.getTime()) / DAY_MS;
      cur.n += 1;
      sums.set(i.status, cur);
    }
  }
  const out = {} as Record<Stage, number | null>;
  for (const s of ORDER_STAGES) {
    const v = sums.get(s);
    out[s] = v && v.n > 0 ? round1(v.total / v.n) : ORDER_STAGE_DEFAULT_DAYS[s];
  }
  return out;
}

export function buildStages(status: string, logs: (StageLogDto & { atDate: Date })[], averages: Record<Stage, number | null>, now: Date): { stages: OrderStageDto[]; stageIndex: number } {
  const intervals = stageIntervals(logs.map((l) => ({ orderId: "", status: l.status, at: l.atDate })));
  const currentIdx = ORDER_STAGES.indexOf(status as Stage);
  const lastIdx = currentIdx >= 0 ? currentIdx : Math.max(-1, ...intervals.map((i) => ORDER_STAGES.indexOf(i.status as Stage)));
  const stages = ORDER_STAGES.map((s, idx): OrderStageDto => {
    const mine = intervals.filter((i) => i.status === s);
    const enteredAt = mine[0]?.enteredAt ?? null;
    const leftAt = mine.length ? (mine[mine.length - 1]!.leftAt ?? null) : null;
    const state: OrderStageDto["state"] = currentIdx >= 0 && idx === currentIdx ? "CURRENT" : idx <= lastIdx && enteredAt ? "DONE" : "PENDING";
    const end = state === "CURRENT" ? now : leftAt;
    const elapsed = enteredAt && end && s !== "COMPLETED" ? round1(mine.reduce((sum, i) => sum + ((i.leftAt ?? now).getTime() - i.enteredAt.getTime()), 0) / DAY_MS) : null;
    const avg = averages[s];
    return {
      status: s,
      state,
      enteredAt: enteredAt?.toISOString() ?? null,
      leftAt: state === "CURRENT" ? null : (leftAt?.toISOString() ?? null),
      elapsedDays: elapsed,
      avgDays: avg,
      slowerThanAvg: elapsed !== null && avg !== null && elapsed > avg,
      logs: logs.filter((l) => l.status === s).map(({ atDate: _a, ...l }) => l),
    };
  });
  return { stages, stageIndex: currentIdx >= 0 ? currentIdx + 1 : lastIdx + 1 };
}
