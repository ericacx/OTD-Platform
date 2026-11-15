import { SYNC_ERROR_TYPES } from "@otd/contracts/sync";
import { pickLabel } from "@otd/shared";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { SyncLogDto } from "./sync.types";
import type { SyncErrorType, SyncQueueState, SyncTransform } from "@otd/contracts/sync";

export const SYNC_OBJECTS = ["ORDER_DUE", "STYLE", "INVENTORY", "TEST_REPORT", "INSPECTION", "TNA"] as const;
export const SYNC_DIRECTIONS = ["PUSH", "PULL"] as const;
export const SYNC_MODES = ["INCREMENTAL", "FULL"] as const;
export const SYNC_TRIGGERS = ["SCHEDULED", "MANUAL", "EVENT"] as const;
export const SYNC_KINDS = ["ERP", "CUSTOMER"] as const;
export const SYNC_PROTOCOLS = ["MOCK", "REST", "SFTP", "EMAIL"] as const;
export const SYNC_QUEUE_STATES = ["PENDING", "MANUAL", "ABANDONED"] as const;
export const SYNC_TRANSFORMS = [
  "dateFormat",
  "codeMap",
  "enumMap",
  "unit",
  "default",
  "concat",
  "split",
  "trim",
  "number",
  "required",
] as const;

type Obj = (typeof SYNC_OBJECTS)[number];
type Dir = (typeof SYNC_DIRECTIONS)[number];
type Mode = (typeof SYNC_MODES)[number];
type Trigger = (typeof SYNC_TRIGGERS)[number];
type Kind = (typeof SYNC_KINDS)[number];
type Protocol = (typeof SYNC_PROTOCOLS)[number];

const isIn = <T extends string>(list: readonly T[], value: string | null | undefined): value is T =>
  !!value && (list as readonly string[]).includes(value);

export const QUEUE_TONE: Record<SyncQueueState, "warning" | "danger" | "neutral"> = {
  PENDING: "warning",
  MANUAL: "danger",
  ABANDONED: "neutral",
};

export function formatDurationMs(ms: number | null | undefined): { m: number; s: number } | null {
  if (ms === null || ms === undefined) return null;
  const total = Math.round(ms / 1000);
  return { m: Math.floor(total / 60), s: total % 60 };
}

export function useSyncLabels() {
  const { t, i18n } = useTranslation("sync");
  const object = useCallback(
    (v: string | null | undefined) => (isIn<Obj>(SYNC_OBJECTS, v) ? t(`OBJ_${v}`) : (v ?? "—")),
    [t],
  );
  const direction = useCallback(
    (v: string | null | undefined) => (isIn<Dir>(SYNC_DIRECTIONS, v) ? t(`DIR_${v}`) : (v ?? "—")),
    [t],
  );
  const mode = useCallback(
    (v: string | null | undefined) => (isIn<Mode>(SYNC_MODES, v) ? t(`MODE_${v}`) : (v ?? "—")),
    [t],
  );
  const trigger = useCallback(
    (v: string | null | undefined) => (isIn<Trigger>(SYNC_TRIGGERS, v) ? t(`TRIGGER_${v}`) : (v ?? "—")),
    [t],
  );
  const kind = useCallback(
    (v: string | null | undefined) => (isIn<Kind>(SYNC_KINDS, v) ? t(`KIND_${v}`) : (v ?? "—")),
    [t],
  );
  const protocol = useCallback(
    (v: string | null | undefined) => (isIn<Protocol>(SYNC_PROTOCOLS, v) ? t(`PROTOCOL_${v}`) : (v ?? "—")),
    [t],
  );
  const queueState = useCallback((v: SyncQueueState) => t(`STATE_${v}`), [t]);
  const transform = useCallback((v: SyncTransform | undefined) => (v ? t(`TRANSFORM_${v}`) : t("TRANSFORM_NONE")), [t]);
  const errorType = useCallback(
    (v: SyncErrorType | null | undefined) => (v ? pickLabel(SYNC_ERROR_TYPES[v].label, i18n.language) : "—"),
    [i18n.language],
  );
  const duration = useCallback(
    (ms: number | null | undefined) => {
      const d = formatDurationMs(ms);
      if (!d) return "—";
      return d.m > 0 ? t("DUR_MIN_SEC", { m: d.m, s: d.s }) : t("DUR_SEC", { s: d.s });
    },
    [t],
  );
  const platform = t("PLATFORM");
  const systems = useCallback(
    (direction: string, endpointName: string) =>
      direction === "PULL" ? { source: endpointName, target: platform } : { source: platform, target: endpointName },
    [platform],
  );
  const logText = useCallback(
    (log: SyncLogDto) => {
      const p = log.params;
      const n = (k: string) => Number(p[k] ?? 0).toLocaleString();
      switch (log.action) {
        case "sync.task.create":
          return t("LOG_CREATE");
        case "sync.task.update":
          return t("LOG_UPDATE");
        case "sync.task.enable":
          return t("LOG_ENABLE");
        case "sync.task.disable":
          return t("LOG_DISABLE");
        case "sync.task.run":
          return t("LOG_RUN", { trigger: trigger(typeof p.trigger === "string" ? p.trigger : null) });
        case "sync.run.finish":
          return p.error
            ? t("LOG_FINISH_ERROR", { error: typeof p.error === "string" ? p.error : JSON.stringify(p.error) })
            : t("LOG_FINISH", { success: n("success"), failed: n("failed"), skipped: n("skipped") });
        case "sync.task.retry":
          return t(p.mode === "AUTO" ? "LOG_RETRY_AUTO" : "LOG_RETRY_MANUAL", {
            total: n("total"),
            success: n("success"),
            failed: n("failed"),
          });
        case "sync.record.abandon":
          return t("LOG_ABANDON", { count: n("count") });
        default:
          return log.summary;
      }
    },
    [t, trigger],
  );
  return useMemo(
    () => ({
      object,
      direction,
      mode,
      trigger,
      kind,
      protocol,
      queueState,
      transform,
      errorType,
      duration,
      systems,
      logText,
    }),
    [object, direction, mode, trigger, kind, protocol, queueState, transform, errorType, duration, systems, logText],
  );
}
