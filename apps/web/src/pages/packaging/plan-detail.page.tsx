import { ArrowLeft, Boxes, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { ProgressTimeline } from "@/components/biz/progress-timeline";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { PlanConfirmDialog } from "@/features/packaging/components/plan-confirm-dialog";
import { PlanFormDialog } from "@/features/packaging/components/plan-form-dialog";
import { VersionCompare } from "@/features/packaging/components/version-compare";
import { useGenerateCartonsMutation, usePlanActionMutation } from "@/features/packaging/packaging.mutations";
import { usePackagingPlanQuery } from "@/features/packaging/packaging.queries";
import { formatDate } from "@/lib/date";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { PackagingPlanDetailDto } from "@/features/packaging/packaging.types";

type Pending = "submit" | "return" | "generate" | null;

export function PackagingPlanDetailPage() {
  const { id } = useParams();
  const plan = usePackagingPlanQuery(id);
  if (plan.isLoading) return <LoadingState className="m-6" />;
  if (plan.error || !plan.data) return <ErrorState error={plan.error} />;
  return <PlanDetail plan={plan.data} />;
}

function PlanDetail({ plan }: { plan: PackagingPlanDetailDto }) {
  const { t } = useTranslation("packaging");
  const navigate = useNavigate();
  const action = usePlanActionMutation(plan.id);
  const generate = useGenerateCartonsMutation();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  usePublishPageDoc({ docType: "packaging", docId: plan.id, docNo: plan.docNo });

  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("FAILED"));
    } finally {
      setPending(null);
    }
  };

  const fields = [
    { label: t("DOC_NO"), value: <span className="tabular">{plan.docNo}</span> },
    { label: t("CUSTOMER"), value: plan.customerName },
    { label: t("CUSTOMER_CODE"), value: plan.customerCode },
    { label: t("F_destination"), value: plan.destination },
    { label: t("F_method"), value: plan.method },
    { label: t("F_pairsPerCarton"), value: plan.pairsPerCarton },
    { label: t("F_cartonSize"), value: plan.cartonSize },
    { label: t("F_cartonType"), value: plan.cartonType },
    { label: t("F_strength"), value: plan.strength },
    { label: t("F_shippingMark"), value: plan.shippingMark },
    { label: t("F_markPosition"), value: plan.markPosition },
    { label: t("F_sizeSticker"), value: plan.sizeSticker },
    { label: t("F_sealSticker"), value: plan.sealSticker },
    { label: t("F_innerBag"), value: plan.innerBag },
    { label: t("F_tape"), value: plan.tape },
    { label: t("OWNER"), value: plan.ownerName },
    { label: t("UPDATED_AT"), value: formatDate(plan.updatedAt) },
    { label: t("APPLICABLE_LINES"), value: plan.applicable.cartonLines },
    { label: t("APPLICABLE_PAIRS"), value: plan.applicable.pairs.toLocaleString() },
    { label: t("APPLICABLE_CARTONS"), value: plan.applicable.cartons.toLocaleString() },
    {
      label: t("CUSTOMER_CONFIRM"),
      span: 2 as const,
      value: plan.confirmedBy
        ? `${plan.confirmedBy} · ${plan.confirmMethod ? t(`METHOD_${plan.confirmMethod}`) : ""} · ${formatDate(plan.confirmedAt, true)}`
        : null,
    },
  ];

  const actions = (
    <>
      {plan.orderId ? (
        <Button asChild variant="outline">
          <Link to={`/orders/${plan.orderId}`}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("BACK_TO_PO", { poNo: plan.poNo })}
          </Link>
        </Button>
      ) : null}
      {plan.orderId ? (
        <Button asChild variant="outline">
          <Link to={`/packaging/cartons?orderId=${plan.orderId}`}>
            <Boxes aria-hidden="true" className="size-4" />
            {t("VIEW_CARTONS")}
          </Link>
        </Button>
      ) : null}
      {plan.status === "DRAFT" ? (
        <RequirePermission code="packaging.plan.edit">
          <Button variant="outline" onClick={() => setEditing(true)}>
            {t("ACTION_EDIT")}
          </Button>
          <Button onClick={() => setPending("submit")}>{t("ACTION_SUBMIT")}</Button>
        </RequirePermission>
      ) : null}
      {plan.status === "PENDING_CUSTOMER" ? (
        <>
          <RequirePermission code={["packaging.plan.edit", "packaging.plan.confirm"]}>
            <Button variant="outline" onClick={() => setPending("return")}>
              {t("ACTION_RETURN")}
            </Button>
          </RequirePermission>
          <RequirePermission code="packaging.plan.confirm">
            <Button onClick={() => setConfirming(true)}>{t("ACTION_CONFIRM")}</Button>
          </RequirePermission>
        </>
      ) : null}
      {plan.status === "CONFIRMED" ? (
        <>
          <RequirePermission code="packaging.plan.edit">
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("ACTION_REVISE")}
            </Button>
          </RequirePermission>
          {plan.orderId ? (
            <RequirePermission code="packaging.carton.edit">
              <Button variant="outline" onClick={() => setPending("generate")}>
                {t("ACTION_GENERATE")}
              </Button>
            </RequirePermission>
          ) : null}
          <Button disabled variant="secondary">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {t("METHOD_CONFIRMED")}
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <section className="space-y-5">
      <DetailHeaderCard
        actions={actions}
        fields={fields}
        subtitle={[
          plan.method,
          plan.pairsPerCarton ? t("PER_CARTON", { n: plan.pairsPerCarton }) : null,
          plan.cartonSize,
        ]
          .filter(Boolean)
          .join(" ｜ ")}
        tags={
          <>
            <PrimaryTag>{plan.customerName}</PrimaryTag>
            <StatusBadge code={plan.status} machine="packagingPlan" />
            <ToneBadge label={`v${plan.currentVersion}`} tone="info" />
            {plan.effectiveVersion && plan.effectiveVersion !== plan.currentVersion ? (
              <ToneBadge label={t("EFFECTIVE_VERSION", { version: plan.effectiveVersion })} tone="success" />
            ) : null}
            <ToneBadge label={[plan.customerCode, plan.destination].filter(Boolean).join(" · ")} />
          </>
        }
        title={`${plan.docNo} · ${plan.title}`}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title={t("REQUIREMENTS")}>
          {plan.requirements.length ? (
            <FieldGrid
              columns={2}
              items={plan.requirements.map((r, i) => ({
                key: `${i}`,
                label: r.title,
                value: r.content,
                span: "full" as const,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("NO_REQUIREMENTS")}</p>
          )}
        </SectionCard>
        <SectionCard title={t("VERSIONS")}>
          <ProgressTimeline
            steps={plan.versions.map((v) => ({
              key: String(v.versionNo),
              title: [
                `v${v.versionNo} ${v.versionNo === 1 ? t("V_CREATED") : t("V_REVISED")}`,
                v.customerConfirmed ? t("V_CONFIRMED") : null,
                v.effective ? t("V_EFFECTIVE") : null,
              ]
                .filter(Boolean)
                .join(" · "),
              state: v.current ? ("current" as const) : ("done" as const),
              description: [formatDate(v.changedAt, true), v.changedByName, v.changeNote].filter(Boolean).join(" · "),
              meta: v.confirmedBy
                ? t("V_CONFIRM_META", {
                    by: v.confirmedBy,
                    method: v.confirmMethod ? t(`METHOD_${v.confirmMethod}`) : "",
                    at: formatDate(v.confirmedAt, true),
                  })
                : undefined,
            }))}
          />
        </SectionCard>
      </div>
      <VersionCompare key={plan.versions.length} plan={plan} />
      <PlanFormDialog open={editing} plan={plan} onOpenChange={setEditing} />
      <PlanConfirmDialog open={confirming} plan={plan} onOpenChange={setConfirming} />
      <ConfirmDialog
        description={t("SUBMIT_DESC", { docNo: plan.docNo, version: plan.currentVersion })}
        isProcessing={action.isPending}
        open={pending === "submit"}
        title={t("ACTION_SUBMIT")}
        onConfirm={() => run(() => action.mutateAsync({ kind: "submit", version: plan.version }), t("DONE_SUBMIT"))}
        onOpenChange={(open) => !open && setPending(null)}
      />
      <ConfirmDialog
        description={t("RETURN_DESC", { docNo: plan.docNo })}
        isProcessing={action.isPending}
        open={pending === "return"}
        title={t("ACTION_RETURN")}
        onConfirm={() => run(() => action.mutateAsync({ kind: "return", version: plan.version }), t("DONE_RETURN"))}
        onOpenChange={(open) => !open && setPending(null)}
      />
      <ConfirmDialog
        description={t("GENERATE_DESC", { poNo: plan.poNo, version: plan.effectiveVersion ?? plan.currentVersion })}
        isProcessing={generate.isPending}
        open={pending === "generate"}
        title={t("ACTION_GENERATE")}
        onConfirm={() =>
          run(async () => {
            const rows = await generate.mutateAsync({ orderId: plan.orderId!, planId: plan.id });
            if (rows.length) void navigate(`/packaging/cartons?orderId=${plan.orderId}`);
            else toast.info(t("GENERATE_NONE"));
          }, t("DONE_GENERATE"))
        }
        onOpenChange={(open) => !open && setPending(null)}
      />
    </section>
  );
}
