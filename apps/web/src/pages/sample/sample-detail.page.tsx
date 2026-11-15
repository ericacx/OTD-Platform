import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { FieldGrid } from "@/components/biz/field-grid";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader, useRouteCrumbs } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { useDictLabel } from "@/features/planning/dict";
import { LibraryFormDialog, MaterialFormDialog } from "@/features/sample/components/library-dialogs";
import {
  AdvanceRoundDialog,
  ApproveRoundDialog,
  NEXT_STAGES,
  NewRoundDialog,
} from "@/features/sample/components/round-dialogs";
import { RoundProgress } from "@/features/sample/components/round-progress";
import { useArriveMaterialMutation } from "@/features/sample/sample.mutations";
import { useSampleQuery } from "@/features/sample/sample.queries";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { RoundDto, SampleDetailDto } from "@/features/sample/sample.types";
import type { DocType } from "@otd/shared";

export function SampleDetailPage() {
  const { id } = useParams();
  const query = useSampleQuery(id);
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState error={query.error ?? new Error("not found")} />;
  return <SampleDetail sample={query.data} />;
}

function SampleDetail({ sample: s }: { sample: SampleDetailDto }) {
  usePublishPageDoc({ docType: "sample" satisfies DocType, docId: s.id, docNo: s.docNo });
  const { t } = useTranslation("sample");
  const { t: tc } = useTranslation();
  const dict = useDictLabel();
  const arrive = useArriveMaterialMutation();
  const crumbs = useRouteCrumbs().map((c) => (c.to ? { ...c, to: "/samples" } : c));
  const [selected, setSelected] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState<RoundDto | null>(null);
  const [approving, setApproving] = useState<RoundDto | null>(null);
  const [newRound, setNewRound] = useState(false);
  const [addLibrary, setAddLibrary] = useState(false);
  const [addMaterial, setAddMaterial] = useState(false);
  const current = s.rounds[s.rounds.length - 1] ?? null;
  const round = s.rounds.find((r) => r.id === selected) ?? current;
  const roundLabel = (r: RoundDto) => t("ROUND_LABEL", { type: dict("roundType", r.roundType), no: r.roundNo });
  const terminal = current ? current.status === "APPROVED" || current.status === "REVISE" : true;
  const nextTargets = current ? (NEXT_STAGES[current.status] ?? []) : [];

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {s.planningId ? (
              <Button asChild variant="outline">
                <Link to={`/planning/${s.planningId}`}>
                  <ArrowLeft aria-hidden="true" />
                  {t("BACK_TO", { no: s.planningDocNo ?? "" })}
                </Link>
              </Button>
            ) : null}
            {current && nextTargets.length ? (
              <RequirePermission
                code={
                  current.status === "READY" || current.status === "SHIPPED"
                    ? ["sample.sample.advance", "sample.sample.approve"]
                    : "sample.sample.advance"
                }
              >
                <Button
                  variant={current.status === "AWAITING_APPROVAL" ? "outline" : "default"}
                  onClick={() => setAdvancing(current)}
                >
                  {t("ADVANCE_TO_NEXT", { stage: t(`ST_${nextTargets[0]!}`) })}
                </Button>
              </RequirePermission>
            ) : null}
            {current?.status === "AWAITING_APPROVAL" ? (
              <RequirePermission code="sample.sample.approve">
                <Button onClick={() => setApproving(current)}>{t("APPROVE_TITLE")}</Button>
              </RequirePermission>
            ) : null}
            {terminal ? (
              <RequirePermission code="sample.sample.create">
                <Button variant="outline" onClick={() => setNewRound(true)}>
                  {t("NEW_ROUND")}
                </Button>
              </RequirePermission>
            ) : null}
          </>
        }
        crumbs={crumbs}
        extraCrumbs={[{ label: s.styleNo }]}
        title={t("DETAIL_TITLE")}
      />

      <DetailHeaderCard
        fields={[
          { label: t("F_PRODUCT_CODE"), value: s.productCode },
          { label: t("F_SEASON"), value: s.seasonCode },
          { label: t("F_TEAM"), value: s.teamOrgName },
          { label: t("COL_FACTORY"), value: s.factoryName },
          { label: t("F_LOCATION"), value: s.location },
          { label: t("F_COLOR"), value: s.colorway },
          { label: t("F_SIZE"), value: s.size },
          { label: t("F_QTY"), value: current ? t("PAIRS", { count: current.quantity }) : null },
          { label: t("F_DUE"), value: s.dueDate },
          {
            label: t("F_STAGE"),
            value: current ? (
              current.stageIndex >= 1 && current.stageIndex <= 5 ? (
                t("STAGE_TITLE", { no: String(current.stageIndex).padStart(2, "0"), name: t(`ST_${current.status}`) })
              ) : (
                <StatusBadge code={current.status} machine="sampleRound" />
              )
            ) : null,
          },
          { label: t("F_CUSTOMER_REF"), value: s.customerRef, span: 2 },
          {
            label: t("F_PLANNING"),
            value: s.planningId ? <DocNoLink no={s.planningDocNo} to={`/planning/${s.planningId}`} /> : null,
          },
          { label: t("F_TECHNICIAN"), value: s.technicianName },
        ]}
        imageCaption={t("IMAGE_CAPTION")}
        showImage
        subtitle={`${s.seasonCode ?? ""} – ${s.styleNo} – ${s.styleNameEn ?? ""} · ${s.docNo} · ${s.customerName}`}
        tags={
          current ? (
            <>
              <ToneBadge label={current.roundType} tone="info" />
              {s.costStatus === "COST_REVIEW" ? <ToneBadge label={t("COST_REVIEW")} tone="warning" /> : null}
              <ToneBadge label={roundLabel(current)} />
              {current.reworkCount > 0 ? (
                <PrimaryTag>{t("REWORK_CARRIED", { count: current.reworkCount })}</PrimaryTag>
              ) : null}
              {terminal ? (
                <StatusBadge code={current.status} machine="sampleRound" />
              ) : (
                <ToneBadge
                  label={current.progress === "SLOW" ? t("PROGRESS_SLOW") : t("PROGRESS_NORMAL")}
                  tone={current.progress === "SLOW" ? "danger" : "success"}
                />
              )}
            </>
          ) : null
        }
        title={`#${s.styleNo} · ${s.styleNameZh}`}
      />

      <SectionCard title={t("CRAFT_TITLE")}>
        <FieldGrid
          columns={2}
          items={[
            { label: t("F_BRIEF"), value: s.briefTranslation, span: "full" },
            { label: t("F_YARN"), value: s.yarnConfig, span: "full" },
            { label: t("F_CRAFT"), value: s.craftNotes, span: "full" },
            { label: t("F_SAMPLE_NOTES"), value: s.sampleNotes, span: "full" },
          ]}
        />
      </SectionCard>

      {round ? (
        <SectionCard
          extra={
            <span>
              {t("PROGRESS_SUB", { due: round.dueDate ?? "—" })}
              {round.remainingDays !== null && !terminal ? (
                <span className={cn("ml-1", round.remainingDays < 0 && "text-danger")}>
                  {round.remainingDays < 0
                    ? t("OVERDUE_DAYS", { days: -round.remainingDays })
                    : t("REMAINING_DAYS", { days: round.remainingDays })}
                </span>
              ) : null}
            </span>
          }
          title={t("PROGRESS_TITLE")}
        >
          {s.rounds.length > 1 ? (
            <div aria-label={t("ROUNDS")} className="mb-4 flex flex-wrap gap-2" role="tablist">
              {s.rounds.map((r) => (
                <button
                  aria-selected={r.id === round.id}
                  className={cn(
                    "rounded-md border px-3 py-1 text-sm",
                    r.id === round.id
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground",
                  )}
                  key={r.id}
                  role="tab"
                  type="button"
                  onClick={() => setSelected(r.id)}
                >
                  {roundLabel(r)} · {t(`ST_${r.status}`)}
                </button>
              ))}
            </div>
          ) : null}
          <RoundProgress round={round} />
          {round.reviseNote || round.approvalResult || round.shipmentDocNo ? (
            <div className="mt-4 grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2">
              {round.reviseNote ? (
                <p>
                  <span className="text-muted-foreground">{t("REVISE_NOTE")}：</span>
                  {round.reviseNote}
                </p>
              ) : null}
              {round.shipmentDocNo ? (
                <p>
                  <span className="text-muted-foreground">{t("SHIPMENT")}：</span>
                  {round.shipmentDocNo}
                </p>
              ) : null}
              {round.approvalResult ? (
                <p>
                  <span className="text-muted-foreground">{t("APPROVE_RESULT")}：</span>
                  {t(`ST_${round.approvalResult}`)} · {round.approvalDate ?? "—"}{" "}
                  {round.approvalNote ? `· ${round.approvalNote}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          extra={
            <RequirePermission code="sample.material.edit">
              <Button size="sm" variant="outline" onClick={() => setAddMaterial(true)}>
                {t("MAT_NEW")}
              </Button>
            </RequirePermission>
          }
          title={t("MATERIALS_TITLE")}
        >
          {s.materials.length ? (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">{t("MAT_NAME")}</th>
                  <th className="pb-2 text-left font-medium">{t("MAT_SPEC")}</th>
                  <th className="pb-2 text-right font-medium">{t("F_QTY")}</th>
                  <th className="pb-2 text-left font-medium">{t("MAT_ARRIVAL")}</th>
                  <th className="pb-2 text-left font-medium">{tc("TBL_ACTIONS")}</th>
                </tr>
              </thead>
              <tbody>
                {s.materials.map((m) => (
                  <tr className="border-t border-border" key={m.id}>
                    <td className="py-2">{m.materialName}</td>
                    <td className="py-2 text-muted-foreground">{m.spec ?? "—"}</td>
                    <td className="tabular py-2 text-right">
                      {m.quantity !== null ? `${formatNumber(m.quantity, 1)} ${m.unit ?? ""}` : "—"}
                    </td>
                    <td className={cn("tabular py-2", m.overdue && "text-danger")}>{m.arrivalDate ?? "—"}</td>
                    <td className="py-2">
                      {m.status === "ARRIVED" ? (
                        <ToneBadge label={t("MAT_ARRIVED")} tone="success" />
                      ) : (
                        <RequirePermission
                          code="sample.material.edit"
                          fallback={<ToneBadge label={t("MAT_PENDING")} tone="warning" />}
                        >
                          <Button
                            className="h-auto px-1"
                            variant="link"
                            onClick={() =>
                              void arrive
                                .mutateAsync({ id: m.id, version: m.version })
                                .then(() => toast.success(t("MAT_ARRIVE_OK")))
                                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : tc("BIZERR")))
                            }
                          >
                            {t("MAT_ARRIVE")}
                          </Button>
                        </RequirePermission>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">{t("MAT_EMPTY")}</p>
          )}
        </SectionCard>
        <SectionCard
          extra={
            <RequirePermission code="sample.library.edit">
              <Button size="sm" variant="outline" onClick={() => setAddLibrary(true)}>
                {t("LIB_NEW")}
              </Button>
            </RequirePermission>
          }
          title={t("LIBRARY_TITLE")}
        >
          {s.library.length ? (
            <ul className="space-y-2 text-sm">
              {s.library.map((l) => (
                <li className="flex flex-wrap items-center gap-2" key={l.id}>
                  <ToneBadge label={t(`KIND_${l.kind}`)} tone={l.kind === "QRS" ? "success" : "info"} />
                  <span>{l.location ?? "—"}</span>
                  <span className="text-muted-foreground">{t("PAIRS", { count: l.quantity })}</span>
                  <span className="text-muted-foreground">{l.roundLabel ?? ""}</span>
                  {l.status === "LENT" ? (
                    <ToneBadge label={t("LIB_LENT_TO", { name: l.borrower ?? "" })} tone="warning" />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("LIB_EMPTY")}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t("CREATED_AT", { time: formatDate(s.createdAt, true) })} · {s.ownerName}
          </p>
        </SectionCard>
      </div>

      <AdvanceRoundDialog
        location={s.location}
        round={advancing}
        onOpenChange={(open) => !open && setAdvancing(null)}
      />
      <ApproveRoundDialog round={approving} onOpenChange={(open) => !open && setApproving(null)} />
      <NewRoundDialog open={newRound} sample={s} onOpenChange={setNewRound} />
      <MaterialFormDialog open={addMaterial} sampleId={s.id} onOpenChange={setAddMaterial} />
      <LibraryFormDialog
        open={addLibrary}
        preset={{
          styleId: s.styleId,
          sampleId: s.id,
          roundId: current?.id ?? null,
          label: `#${s.styleNo} · ${s.styleNameZh}`,
        }}
        onOpenChange={setAddLibrary}
      />
    </section>
  );
}
