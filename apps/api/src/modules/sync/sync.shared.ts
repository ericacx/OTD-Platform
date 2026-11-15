import { SYNC_ERROR_TYPES, SYNC_MAX_RETRIES, SYNC_PLATFORM_NAME, type SyncQueueState, type SyncRunStatus, isRetryableError } from "@otd/contracts/sync";
import { createHash } from "node:crypto";
import { type SQL, isNull, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { type AccessContext, canSeeCustomer } from "../../core/access/access.types.js";
import { customerScoped } from "../../core/access/scope.js";
import { notFound } from "../../core/errors.js";

export type Counters = { total: number; success: number; failed: number; skipped: number };

export function customerVisible(column: PgColumn, ctx: AccessContext): SQL {
  if (ctx.system || ctx.customerScope.mode === "ALL") return sql`true`;
  return or(isNull(column), customerScoped(column, ctx))!;
}

export function assertCustomerVisible<T extends { customerId: string | null }>(ctx: AccessContext, row: T | undefined | null): T {
  if (!row || (row.customerId && !canSeeCustomer(ctx, row.customerId))) throw notFound();
  return row;
}

export function statusOf(c: Pick<Counters, "success" | "failed" | "skipped">): Exclude<SyncRunStatus, "RUNNING"> {
  if (c.failed === 0) return "SUCCESS";
  return c.success + c.skipped > 0 ? "PARTIAL" : "FAILED";
}

export function queueStateOf(status: string, errorType: string | null, attempts: number): SyncQueueState | null {
  if (status === "RETRYING") return "PENDING";
  if (status !== "FAILED") return null;
  return isRetryableError(errorType) && attempts > SYNC_MAX_RETRIES ? "ABANDONED" : "MANUAL";
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hashOf(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function suggestionFor(type: string | null): string | null {
  return type ? ((SYNC_ERROR_TYPES as Record<string, { suggestion: { zh: string } }>)[type]?.suggestion.zh ?? null) : null;
}

export function frequencyLabel(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  if (minutes === 720) return "每半天一次";
  if (minutes === 1440) return "每天一次";
  if (minutes % 1440 === 0) return `每 ${minutes / 1440} 天一次`;
  if (minutes === 60) return "每小时";
  if (minutes % 60 === 0) return `每 ${minutes / 60} 小时`;
  return `每 ${minutes} 分钟`;
}

export function systemsOf(direction: string, endpointName: string): { sourceSystem: string; targetSystem: string } {
  return direction === "PULL" ? { sourceSystem: endpointName, targetSystem: SYNC_PLATFORM_NAME.zh } : { sourceSystem: SYNC_PLATFORM_NAME.zh, targetSystem: endpointName };
}

const TRIGGER_LABEL: Record<string, string> = { SCHEDULED: "定时触发", MANUAL: "手动执行", EVENT: "事件触发" };
const MODE_LABEL: Record<string, string> = { AUTO: "自动重试", MANUAL: "手动重试" };

export function logSummary(action: string, p: Record<string, unknown>): string {
  const n = (k: string) => Number(p[k] ?? 0).toLocaleString("en-US");
  switch (action) {
    case "sync.task.create":
      return "创建同步任务";
    case "sync.task.update":
      return `编辑同步任务${Object.keys(p).length ? `：${Object.keys(p).join("、")}` : ""}`;
    case "sync.task.enable":
      return "启用任务";
    case "sync.task.disable":
      return "停用任务";
    case "sync.task.run":
      return `开始执行（${TRIGGER_LABEL[String(p.trigger)] ?? String(p.trigger ?? "")}）`;
    case "sync.run.finish":
      return p.error ? `执行失败：${String(p.error)}` : `执行完成：成功 ${n("success")} 条，失败 ${n("failed")} 条，跳过 ${n("skipped")} 条`;
    case "sync.task.retry":
      return `${MODE_LABEL[String(p.mode)] ?? "重试"}失败记录 ${n("total")} 条：成功 ${n("success")} 条，仍失败 ${n("failed")} 条`;
    case "sync.task.autoDisable":
      return `连续 ${n("consecutiveFailures")} 次执行失败，已自动停用任务`;
    case "sync.record.abandon":
      return `${n("count")} 条记录超过最大重试次数，已转人工处理`;
    default:
      return action;
  }
}
