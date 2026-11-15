import { metricSnapshots } from "../../schema/index.js";
import type { SeedContext } from "./context.js";

const WEEKLY_CONFIRMED_WAN = [12.6, 18.4, 9.8, 24.1, 15.3, 21.7, 11.2, 19.5];
const WEEKLY_ON_TIME_RATE = [62.5, 58.3, 66.7, 71.4, 60.0, 75.0, 68.8, 72.7];
const MONTHLY_TARGET_WAN = 12;

function mondayOffset(ctx: SeedContext): number {
  const day = new Date(`${ctx.day(0)}T00:00:00Z`).getUTCDay();
  return -((day + 6) % 7);
}

export async function seedMetricsDemo(ctx: SeedContext): Promise<void> {
  const monday = mondayOffset(ctx);
  const rows: { metric: string; scopeKey: string; period: string; value: number; computedAt: Date }[] = [];
  WEEKLY_CONFIRMED_WAN.forEach((value, i) => {
    const offset = monday - 7 * (WEEKLY_CONFIRMED_WAN.length - i);
    const period = `week:${ctx.day(offset)}`;
    const computedAt = ctx.at(offset + 7, 2);
    rows.push({ metric: "confirmedAmount", scopeKey: "ALL", period, value, computedAt });
    rows.push({ metric: "onTimeRate", scopeKey: "ALL", period, value: WEEKLY_ON_TIME_RATE[i]!, computedAt });
  });
  const year = ctx.day(0).slice(0, 4);
  for (let m = 1; m <= 12; m++) {
    rows.push({ metric: "target.confirmedAmount", scopeKey: "ALL", period: `month:${year}-${String(m).padStart(2, "0")}`, value: MONTHLY_TARGET_WAN, computedAt: ctx.at(0, 0) });
  }
  await ctx.db.insert(metricSnapshots).values(rows);
}
