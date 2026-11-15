import { PLANNING_FIELDS, type ProductAttrKey } from "@otd/contracts/planning";
import { FileText, RotateCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { DocNoLink } from "@/components/biz/doc-no-link";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader, useRouteCrumbs } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmPlanningDialog } from "@/features/planning/components/confirm-planning-dialog";
import { useDictLabel, useDictOptions } from "@/features/planning/dict";
import {
  useConfirmPlanningMutation,
  usePlanningActionMutation,
  useUpdatePlanningMutation,
} from "@/features/planning/planning.mutations";
import { usePlanningQuery } from "@/features/planning/planning.queries";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { PlanningDto } from "@/features/planning/planning.types";
import type { DocType } from "@otd/shared";

const EDIT_FIELDS = PLANNING_FIELDS.filter((f) => f !== "customerName");
type EditField = (typeof EDIT_FIELDS)[number];
type AttrDraft = Record<ProductAttrKey, { original: string; translated: string }>;

function draftOf(p: PlanningDto) {
  const fields = Object.fromEntries(EDIT_FIELDS.map((k) => [k, p[k] ?? ""])) as Record<EditField, string>;
  const attrs = Object.fromEntries(
    p.productAttrs.map((a) => [a.key, { original: a.original ?? "", translated: a.translated ?? "" }]),
  ) as AttrDraft;
  return { fields, attrs, brief: p.briefTranslation ?? "" };
}

export function PlanningDetailPage() {
  const { id } = useParams();
  const query = usePlanningQuery(id);
  if (query.isLoading) return <LoadingState />;
  if (query.error || !query.data) return <ErrorState error={query.error ?? new Error("not found")} />;
  return <PlanningDetail key={query.data.id} planning={query.data} />;
}

function PlanningDetail({ planning: p }: { planning: PlanningDto }) {
  usePublishPageDoc({ docType: "planning" satisfies DocType, docId: p.id, docNo: p.docNo });
  const { t } = useTranslation("planning");
  const { t: tc } = useTranslation();
  const dict = useDictLabel();
  const categories = useDictOptions("category", ["WOMEN", "MEN", "KIDS"]);
  const subCategories = useDictOptions("subCategory", ["CREW", "NO_SHOW", "ANKLE", "QUARTER", "HALF_CALF"]);
  const canEdit = useHasPermission("planning.planning.edit");
  const update = useUpdatePlanningMutation();
  const confirm = useConfirmPlanningMutation();
  const archive = usePlanningActionMutation("archive");
  const recognize = usePlanningActionMutation("recognize");
  const manual = usePlanningActionMutation("manual");
  const [draft, setDraft] = useState(() => draftOf(p));
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reviewed, setReviewed] = useState<EditField[]>([]);
  const [syncedVersion, setSyncedVersion] = useState(p.version);
  if (syncedVersion !== p.version) {
    setSyncedVersion(p.version);
    setDraft(draftOf(p));
    setReviewed([]);
  }
  const crumbs = useRouteCrumbs().map((c) =>
    c.to ? { ...c, to: p.status === "ARCHIVED" ? "/planning/archived" : "/planning" } : c,
  );
  const editable = canEdit && (p.status === "EXTRACTED" || p.status === "CONFIRMED");
  const low = new Set(p.lowConfidenceFields);
  const initial = draftOf(p);
  const changedFields = EDIT_FIELDS.filter((k) => draft.fields[k].trim() !== initial.fields[k].trim());
  const changedAttrs = (Object.keys(draft.attrs) as ProductAttrKey[]).filter(
    (k) =>
      draft.attrs[k].original.trim() !== (initial.attrs[k]?.original ?? "").trim() ||
      draft.attrs[k].translated.trim() !== (initial.attrs[k]?.translated ?? "").trim(),
  );
  const briefChanged = draft.brief.trim() !== initial.brief.trim();
  const dirty = changedFields.length > 0 || changedAttrs.length > 0 || briefChanged || reviewed.length > 0;

  function payload() {
    const keys = [...new Set([...changedFields, ...reviewed])].filter(
      (k) => !(p.status === "CONFIRMED" && k === "styleNo"),
    );
    const fields = Object.fromEntries(keys.map((k) => [k, draft.fields[k].trim() || null]));
    const productAttrs = Object.fromEntries(
      changedAttrs.map((k) => [
        k,
        { original: draft.attrs[k].original.trim() || null, translated: draft.attrs[k].translated.trim() || null },
      ]),
    );
    return {
      ...fields,
      ...(briefChanged ? { briefTranslation: draft.brief.trim() || null } : {}),
      ...(changedAttrs.length ? { productAttrs } : {}),
      version: p.version,
    };
  }

  async function save() {
    return update.mutateAsync({ id: p.id, input: payload() });
  }

  async function run<T>(work: () => Promise<T>, success: string) {
    try {
      await work();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  const setField = (key: EditField, value: string) =>
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));
  const setAttr = (key: ProductAttrKey, part: "original" | "translated", value: string) =>
    setDraft((d) => ({ ...d, attrs: { ...d.attrs, [key]: { ...d.attrs[key], [part]: value } } }));

  const confidence = (key: string) => {
    const c = p.extraction?.[key]?.confidence;
    return c === undefined ? null : Math.round(c * 100);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            {p.status === "EXTRACTED" || p.status === "CONFIRMED" ? (
              <RequirePermission code="planning.planning.archive">
                <Button variant="outline" onClick={() => setArchiving(true)}>
                  {t("ARCHIVE")}
                </Button>
              </RequirePermission>
            ) : null}
            {p.status === "RECOGNITION_FAILED" || p.status === "RECOGNIZING" ? (
              <RequirePermission code="planning.planning.create">
                <Button
                  disabled={recognize.isPending}
                  variant="outline"
                  onClick={() =>
                    void run(() => recognize.mutateAsync({ id: p.id, version: p.version }), t("RECOGNIZE_DONE"))
                  }
                >
                  <RotateCw aria-hidden="true" className={cn(recognize.isPending && "animate-spin")} />
                  {t("RETRY")}
                </Button>
              </RequirePermission>
            ) : null}
            {p.status === "RECOGNITION_FAILED" ? (
              <RequirePermission code="planning.planning.edit">
                <Button
                  variant="outline"
                  onClick={() => void run(() => manual.mutateAsync({ id: p.id, version: p.version }), t("MANUAL_DONE"))}
                >
                  {t("MANUAL")}
                </Button>
              </RequirePermission>
            ) : null}
            {editable ? (
              <Button
                disabled={!dirty || update.isPending}
                variant="outline"
                onClick={() => void run(save, t("SAVED"))}
              >
                {t("SAVE")}
              </Button>
            ) : null}
            <RequirePermission code="planning.planning.confirm">
              <Button disabled={p.status !== "EXTRACTED"} onClick={() => setConfirming(true)}>
                {p.status === "CONFIRMED" || p.status === "ARCHIVED" ? t("CONFIRMED_BTN") : t("CONFIRM")}
              </Button>
            </RequirePermission>
          </>
        }
        crumbs={crumbs}
        extraCrumbs={[{ label: p.docNo }]}
        title={t("DETAIL_TITLE")}
      />

      <DetailHeaderCard
        fields={[
          { label: t("F_nameZh"), value: p.nameZh },
          { label: t("F_nameEn"), value: p.nameEn },
          { label: t("F_customer"), value: p.customerName },
          {
            label: t("F_categorySub"),
            value: p.category ? `${dict("category", p.category)} · ${dict("subCategory", p.subCategory)}` : null,
          },
          { label: t("F_defaultSize"), value: p.defaultSize },
          { label: t("F_supplier"), value: p.supplier },
          { label: t("F_buyerName"), value: p.buyerName },
          { label: t("F_designer"), value: p.designer },
          { label: t("F_needleCount"), value: p.needleCount },
          { label: t("F_sockWeight"), value: p.sockWeight },
          { label: t("F_requiredSampleDate"), value: p.requiredSampleDate },
          { label: t("F_sizeRange"), value: p.sizeRange },
        ]}
        imageCaption={t("IMAGE_CAPTION")}
        showImage
        subtitle={`${p.nameEn ?? "—"} · ${p.docNo} · ${t("UPLOADED_AT", { time: formatDate(p.createdAt, true) })}`}
        tags={
          <>
            <ToneBadge label={p.customerName} tone="info" />
            <StatusBadge code={p.status} machine="planning" />
            {p.seasonCode ? <ToneBadge label={p.seasonCode} /> : null}
            {p.extraction ? <PrimaryTag>{t("AI_TAG")}</PrimaryTag> : null}
          </>
        }
        title={`${p.styleNo ? `#${p.styleNo}` : "—"} · ${p.nameZh ?? (p.status === "RECOGNIZING" ? t("RECOGNIZING_NAME") : (p.nameEn ?? "—"))}`}
      />

      {p.recognitionError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("RECOGNITION_ERROR")}：{p.recognitionError}
          </AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        extra={low.size ? <span className="text-warning">{t("LOW_CONF_HINT")}</span> : null}
        title={t("BASIC")}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EDIT_FIELDS.map((key) => {
            const c = confidence(key);
            const isLow = low.has(key);
            return (
              <div
                className={cn("space-y-1.5 rounded-md", isLow && "bg-warning/10 p-2 ring-1 ring-warning/40")}
                data-low={isLow || undefined}
                key={key}
              >
                <Label className="flex items-center justify-between gap-2" htmlFor={`pf-${key}`}>
                  <span>{t(`F_${key}`)}</span>
                  {c !== null && draft.fields[key] ? (
                    <span
                      className={cn("tabular text-xs", isLow ? "text-warning" : "text-muted-foreground")}
                    >{`${c}%`}</span>
                  ) : null}
                </Label>
                {isLow && editable && draft.fields[key] && !(p.status === "CONFIRMED" && key === "styleNo") ? (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground" htmlFor={`pf-ok-${key}`}>
                    <input
                      checked={reviewed.includes(key)}
                      id={`pf-ok-${key}`}
                      type="checkbox"
                      onChange={(e) =>
                        setReviewed((list) => (e.target.checked ? [...list, key] : list.filter((x) => x !== key)))
                      }
                    />
                    {t("MARK_REVIEWED")}
                  </label>
                ) : null}
                {key === "category" || key === "subCategory" ? (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:opacity-50"
                    disabled={!editable}
                    id={`pf-${key}`}
                    value={draft.fields[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  >
                    <option value="">{t("PICK_OPTION")}</option>
                    {(key === "category" ? categories : subCategories).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    disabled={!editable || (p.status === "CONFIRMED" && key === "styleNo")}
                    id={`pf-${key}`}
                    type={key === "requiredSampleDate" ? "date" : "text"}
                    value={draft.fields[key]}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard extra={t("PRODUCT_ATTRS_SUB")} title={t("PRODUCT_ATTRS")}>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 text-left font-medium">{t("ATTR")}</th>
                <th className="pb-2 text-left font-medium">{t("COL_ORIGINAL")}</th>
                <th className="pb-2 text-left font-medium">{t("COL_ZH")}</th>
              </tr>
            </thead>
            <tbody>
              {p.productAttrs.map((a) => {
                const isLow = low.has(`attr.${a.key}`);
                return (
                  <tr className={cn("border-t border-border", isLow && "bg-warning/10")} key={a.key}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div>{a.labelZh}</div>
                      <div className="text-xs text-muted-foreground">{a.labelEn}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`${a.labelZh} ${t("COL_ORIGINAL")}`}
                        disabled={!editable}
                        placeholder="—"
                        value={draft.attrs[a.key].original}
                        onChange={(e) => setAttr(a.key, "original", e.target.value)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        aria-label={`${a.labelZh} ${t("COL_ZH")}`}
                        disabled={!editable}
                        placeholder="—"
                        value={draft.attrs[a.key].translated}
                        onChange={(e) => setAttr(a.key, "translated", e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title={t("ORIGINAL_TRANSLATION")}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{t("ORIGINAL")}</p>
              {p.sourceFile ? (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText aria-hidden="true" className="size-4 text-danger" />
                  {p.sourceFile.filename}
                </p>
              ) : null}
              <ul className="space-y-1 text-xs text-muted-foreground">
                {Object.entries(p.extraction ?? {})
                  .filter(
                    ([, f]) =>
                      f.source && f.source !== "人工修改" && f.source !== "人工确认" && f.source !== "人工预填",
                  )
                  .slice(0, 12)
                  .map(([key, f]) => (
                    <li key={key}>
                      {f.page ? <span className="tabular mr-1 text-subtle-foreground">{`P${f.page}`}</span> : null}
                      {f.source}
                    </li>
                  ))}
              </ul>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold" htmlFor="pf-brief">
                {t("BRIEF_TRANSLATION")}
              </Label>
              <Textarea
                disabled={!editable}
                id="pf-brief"
                rows={8}
                value={draft.brief}
                onChange={(e) => setDraft((d) => ({ ...d, brief: e.target.value }))}
              />
            </div>
          </div>
          <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{t("AI_NOTE")}</p>
        </SectionCard>
      </div>

      <SectionCard title={t("RELATED")}>
        {p.sample ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t("SAMPLE_NO")}</span>
            <DocNoLink no={p.sample.docNo} to={`/samples/${p.sample.id}`} />
            {p.confirmedAt ? (
              <span className="text-muted-foreground">
                {t("CONFIRMED_AT")} {formatDate(p.confirmedAt, true)} · {p.confirmedByName ?? "—"}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("NO_SAMPLE")}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          <Link className="hover:underline" to={p.status === "ARCHIVED" ? "/planning/archived" : "/planning"}>
            {t("BACK_LIST")}
          </Link>
        </p>
      </SectionCard>

      <ConfirmPlanningDialog
        open={confirming}
        onConfirm={async (options) => {
          let version = p.version;
          if (dirty) version = (await save()).version;
          const result = await confirm.mutateAsync({
            id: p.id,
            input: {
              version,
              factoryId: options.factoryId,
              roundType: options.roundType as "PROTO",
              quantity: options.quantity,
            },
          });
          toast.success(t("CONFIRMED_OK", { no: result.sample?.docNo ?? "" }));
          setConfirming(false);
        }}
        onOpenChange={setConfirming}
      />
      <ConfirmDialog
        description={t("ARCHIVE_CONFIRM_DESC", { no: p.docNo })}
        isProcessing={archive.isPending}
        open={archiving}
        title={t("ARCHIVE_CONFIRM_TITLE")}
        onConfirm={async () => {
          await run(() => archive.mutateAsync({ id: p.id, version: p.version }), t("ARCHIVED_OK"));
          setArchiving(false);
        }}
        onOpenChange={setArchiving}
      />
    </section>
  );
}
