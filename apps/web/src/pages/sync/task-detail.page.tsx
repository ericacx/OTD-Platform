import { pickLabel, MENU } from "@otd/shared";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { ProgressTimeline, type TimelineStep } from "@/components/biz/progress-timeline";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/features/sync/components/task-form-dialog";
import { QUEUE_TONE, useSyncLabels } from "@/features/sync/sync.labels";
import { useRetryFailedMutation, useRunTaskMutation, useToggleTaskMutation } from "@/features/sync/sync.mutations";
import { useSyncMappingQuery, useSyncTaskLogsQuery, useSyncTaskQuery } from "@/features/sync/sync.queries";
import { formatDate } from "@/lib/date";

import type { SyncRunDto, SyncTaskDetailDto } from "@/features/sync/sync.types";
import type { ReactNode } from "react";

const TH = "h-10 px-4 text-left font-medium whitespace-nowrap";
const TD = "px-4 py-2.5";

function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function useRunSteps(run: SyncRunDto | null): TimelineStep[] {
  const { t } = useTranslation("sync");
  const step = (key: "START" | "RESULT" | "LOG") => run?.steps.find((s) => s.key === key);
  const at = (key: "START" | "RESULT" | "LOG") => {
    const s = step(key);
    return s ? formatDate(s.at, true) : null;
  };
  const result = step("RESULT");
  const log = step("LOG");
  return [
    { key: "START", title: t("STEP_START"), state: step("START") ? "done" : "pending", description: at("START") },
    {
      key: "RESULT",
      title: t("STEP_RESULT"),
      state: result ? (result.ok ? "done" : "blocked") : run?.status === "RUNNING" ? "current" : "pending",
      description: result ? `${at("RESULT")} · ${result.message ?? ""}` : null,
    },
    {
      key: "LOG",
      title: t("STEP_LOG"),
      state: log ? "done" : "pending",
      description: log ? `${at("LOG")} · ${t("STEP_LOG_DONE")}` : null,
    },
  ];
}

export function TaskDetailPage() {
  const { id } = useParams();
  const task = useSyncTaskQuery(id);
  if (task.isLoading) return <LoadingState />;
  if (task.error || !task.data) return <ErrorState error={task.error} />;
  return <TaskDetail task={task.data} />;
}

function TaskDetail({ task }: { task: SyncTaskDetailDto }) {
  const { t, i18n } = useTranslation("sync");
  const { t: tc } = useTranslation();
  const labels = useSyncLabels();
  const logs = useSyncTaskLogsQuery(task.id);
  const mapping = useSyncMappingQuery(task.mappingId);
  const run = useRunTaskMutation();
  const retry = useRetryFailedMutation();
  const toggle = useToggleTaskMutation();
  const [editing, setEditing] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const steps = useRunSteps(task.latestRun);
  const group = MENU.find((g) => g.moduleKey === "sync");
  const tasksLeaf = group?.children.find((l) => l.permission === "sync.task.view");
  const latest = task.latestRun;
  const systems = labels.systems(task.direction, task.endpointName);
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : tc("BIZERR"));

  const runNow = () =>
    run
      .mutateAsync({ id: task.id, version: task.version })
      .then((res) => {
        const r = res.latestRun;
        if (r) toast.success(t("RUN_DONE", { success: r.success, failed: r.failed, skipped: r.skipped }));
      })
      .catch(fail);
  const retryFailed = () =>
    retry
      .mutateAsync({ id: task.id, version: task.version })
      .then((res) =>
        toast.success(
          t("RETRY_DONE", { total: res.result.total, success: res.result.success, failed: res.result.failed }),
        ),
      )
      .catch(fail);

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <RequirePermission code="sync.task.edit">
              <Button variant="outline" onClick={() => setEditing(true)}>
                {tc("1VV96U")}
              </Button>
            </RequirePermission>
            <RequirePermission code="sync.task.run">
              <Button disabled={!task.enabled || run.isPending} onClick={() => void runNow()}>
                {t("RUN_NOW")}
              </Button>
            </RequirePermission>
            <RequirePermission code={["sync.task.run", "sync.retry.run"]}>
              <Button
                disabled={!task.enabled || task.openFailures === 0 || retry.isPending}
                variant="outline"
                onClick={() => void retryFailed()}
              >
                {t("RETRY_FAILED")}
              </Button>
            </RequirePermission>
            <RequirePermission code="sync.task.edit">
              {task.enabled ? (
                <Button variant="outline" onClick={() => setConfirmDisable(true)}>
                  {t("DISABLE_TASK")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    void toggle.mutateAsync({ id: task.id, enable: true, version: task.version }).catch(fail)
                  }
                >
                  {t("ENABLE_TASK")}
                </Button>
              )}
            </RequirePermission>
          </>
        }
        crumbs={[
          ...(group ? [{ label: pickLabel(group.label, i18n.language) }] : []),
          { label: tasksLeaf ? pickLabel(tasksLeaf.label, i18n.language) : t("TASKS_TITLE"), to: "/sync/tasks" },
          { label: task.docNo },
        ]}
        title={t("DETAIL_TITLE")}
      />

      <DetailHeaderCard
        fields={[
          { label: t("TASK_NO"), value: <span className="tabular">{task.docNo}</span> },
          { label: t("TASK_NAME"), value: task.name, span: 2 },
          { label: t("OBJECT"), value: labels.object(task.object) },
        ]}
        subtitle={`${systems.source} → ${systems.target}`}
        tags={
          <>
            {task.customerCode ? <PrimaryTag>{task.customerCode}</PrimaryTag> : null}
            {task.lastStatus ? <StatusBadge code={task.lastStatus} machine="syncRun" /> : null}
            <ToneBadge label={labels.trigger(task.trigger)} tone="info" />
            <ToneBadge label={labels.mode(task.mode)} tone="info" />
            <ToneBadge label={labels.direction(task.direction)} tone="info" />
            {task.enabled ? null : <ToneBadge label={t("DISABLED_TAG")} tone="neutral" />}
          </>
        }
        title={`${task.docNo} · ${task.name}`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("GROUP_LINK")}>
          <FieldGrid
            columns={3}
            items={[
              { label: t("CUSTOMER"), value: task.customerName },
              { label: t("SOURCE_SYSTEM"), value: systems.source },
              { label: t("TARGET_SYSTEM"), value: systems.target },
              { label: t("DIRECTION"), value: labels.direction(task.direction) },
              { label: t("MODE"), value: labels.mode(task.mode) },
              { label: t("TRIGGER"), value: labels.trigger(task.trigger) },
            ]}
          />
        </SectionCard>
        <SectionCard title={t("GROUP_EXEC")}>
          <FieldGrid
            columns={3}
            items={[
              {
                label: t("FREQUENCY"),
                value: task.trigger === "SCHEDULED" ? task.frequency : labels.trigger(task.trigger),
              },
              { label: t("OWNER"), value: task.ownerName },
              { label: t("LAST_RUN"), value: formatDate(task.lastRunAt, true) },
              { label: t("NEXT_RUN"), value: task.nextRunAt ? formatDate(task.nextRunAt, true) : null },
              { label: t("CREATED_AT"), value: formatDate(task.createdAt, true) },
              { label: t("UPDATED_AT"), value: formatDate(task.updatedAt, true) },
              { label: t("NOTE"), value: task.note, span: "full" },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard extra={latest ? labels.trigger(latest.trigger) : null} title={t("STEPS")}>
          {latest ? <ProgressTimeline steps={steps} /> : <EmptyState title={t("NO_RUN")} />}
        </SectionCard>
        <SectionCard bodyClassName="p-0" extra={mapping.data?.name} title={t("MAPPING_CARD")}>
          {mapping.data && mapping.data.fields.length ? (
            <Table
              head={
                <>
                  <th className={TH}>{task.direction === "PULL" ? t("PULL_SOURCE_FIELD") : t("OTD_FIELD")}</th>
                  <th className={TH}>{task.direction === "PULL" ? t("PULL_TARGET_FIELD") : t("REMOTE_FIELD")}</th>
                  <th className={TH}>{t("TRANSFORM")}</th>
                </>
              }
            >
              {mapping.data.fields.map((f) => (
                <tr className="border-t border-border" key={f.target}>
                  <td className={TD}>
                    <code className="text-xs">{f.source || "—"}</code>
                  </td>
                  <td className={TD}>
                    <code className="text-xs">{f.target}</code>
                  </td>
                  <td className={TD}>
                    {labels.transform(f.transform)}
                    {f.args && Object.keys(f.args).length ? (
                      <span
                        className="ml-1 inline-block max-w-56 truncate align-bottom font-mono text-xs text-muted-foreground"
                        title={JSON.stringify(f.args)}
                      >
                        {JSON.stringify(f.args)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">{t("NO_MAPPING_FIELDS")}</p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        bodyClassName="p-0"
        extra={
          latest ? (
            <span className="tabular">
              {t("RUN_DONE", { success: latest.success, failed: latest.failed, skipped: latest.skipped })}
            </span>
          ) : null
        }
        title={t("BATCHES")}
      >
        {latest && latest.batches.length ? (
          <Table
            head={
              <>
                <th className={TH}>{t("BATCH")}</th>
                <th className={TH}>{t("OBJECT")}</th>
                <th className={TH}>{t("STARTED_AT")}</th>
                <th className={TH}>{t("DURATION")}</th>
                <th className={`${TH} text-right`}>{t("RECORDS")}</th>
                <th className={`${TH} text-right`}>{t("SUCCESS")}</th>
                <th className={`${TH} text-right`}>{t("FAILED")}</th>
                <th className={`${TH} text-right`}>{t("SKIPPED")}</th>
                <th className={TH}>{t("STATUS")}</th>
              </>
            }
          >
            {latest.batches.map((b) => (
              <tr className="border-t border-border" key={b.id}>
                <td className={`${TD} font-medium`}>{b.batchNo}</td>
                <td className={TD}>{labels.object(b.object)}</td>
                <td className={`${TD} tabular`}>{formatDate(b.startedAt, true)}</td>
                <td className={`${TD} tabular`}>{labels.duration(b.durationMs)}</td>
                <td className={`${TD} tabular text-right`}>{b.total.toLocaleString()}</td>
                <td className={`${TD} tabular text-right`}>{b.success.toLocaleString()}</td>
                <td className={`${TD} tabular text-right ${b.failed ? "font-semibold text-danger" : ""}`}>
                  {b.failed}
                </td>
                <td className={`${TD} tabular text-right`}>{b.skipped}</td>
                <td className={TD}>
                  <StatusBadge code={b.status} machine="syncRun" />
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">{t("NO_RUN")}</p>
        )}
      </SectionCard>

      <SectionCard bodyClassName="p-0" title={t("FAILURES")}>
        {task.failures.length ? (
          <Table
            head={
              <>
                <th className={TH}>{t("RECORD_KEY")}</th>
                <th className={TH}>{t("FIELD")}</th>
                <th className={TH}>{t("ERROR_TYPE")}</th>
                <th className={TH}>{t("REASON")}</th>
                <th className={TH}>{t("SUGGESTION")}</th>
                <th className={TH}>{t("QUEUE_STATE")}</th>
                <th className={TH}>{t("NEXT_RETRY")}</th>
              </>
            }
          >
            {task.failures.map((f) => (
              <tr className="border-t border-border" key={f.id}>
                <td className={`${TD} font-medium whitespace-nowrap`}>{f.recordKey}</td>
                <td className={TD}>{f.field ? <code className="text-xs">{f.field}</code> : "—"}</td>
                <td className={TD}>
                  <ToneBadge label={labels.errorType(f.errorType)} tone="danger" />
                </td>
                <td className={TD}>{f.errorMessage ?? "—"}</td>
                <td className={`${TD} text-muted-foreground`}>{f.suggestion ?? "—"}</td>
                <td className={TD}>
                  {f.queueState ? (
                    <ToneBadge label={labels.queueState(f.queueState)} tone={QUEUE_TONE[f.queueState]} />
                  ) : null}
                </td>
                <td className={`${TD} tabular whitespace-nowrap`}>
                  {f.nextRetryAt ? formatDate(f.nextRetryAt, true) : "—"}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={CheckCircle2} title={t("QUEUE_EMPTY")} />
        )}
      </SectionCard>

      <SectionCard bodyClassName="p-0" title={t("LOGS")}>
        <Table
          head={
            <>
              <th className={TH}>{t("LOG_TIME")}</th>
              <th className={TH}>{t("LOG_USER")}</th>
              <th className={TH}>{t("LOG_RECORD")}</th>
            </>
          }
        >
          {(logs.data?.items ?? []).map((log) => (
            <tr className="border-t border-border" key={log.id}>
              <td className={`${TD} tabular whitespace-nowrap text-muted-foreground`}>{formatDate(log.at, true)}</td>
              <td className={`${TD} whitespace-nowrap`}>
                {!log.userName || log.userName === "system" ? t("SYSTEM_USER") : log.userName}
              </td>
              <td className={TD}>{labels.logText(log)}</td>
            </tr>
          ))}
        </Table>
      </SectionCard>

      <TaskFormDialog open={editing} task={task} onOpenChange={setEditing} />
      <ConfirmDialog
        description={t("DISABLE_CONFIRM", { name: task.name })}
        isProcessing={toggle.isPending}
        open={confirmDisable}
        title={t("DISABLE_TASK")}
        variant="destructive"
        onConfirm={async () => {
          await toggle.mutateAsync({ id: task.id, enable: false, version: task.version }).catch(fail);
          setConfirmDisable(false);
        }}
        onOpenChange={setConfirmDisable}
      />
    </section>
  );
}
