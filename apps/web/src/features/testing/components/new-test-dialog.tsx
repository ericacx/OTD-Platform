import { TEST_ITEMS, TEST_ITEM_LABELS } from "@otd/contracts/testing";
import { pickLabel } from "@otd/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { ToneBadge } from "@/components/biz/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { useStyleOptionsQuery } from "@/features/planning/planning.queries";

import { useCreateTestMutation, useReuseCheckMutation } from "../testing.mutations";

import { ReuseChecks } from "./reuse-checks";

import type { ReuseCheckResultDto } from "../testing.types";
import type { TestItem } from "@otd/contracts/testing";

type Form = {
  styleId: string;
  stage: "DEV" | "BULK";
  entrust: "" | "CUSTOMER_PLATFORM" | "FACTORY";
  agencyId: string;
  serviceLevel: string;
  standard: string;
  sampleQty: string;
  sampleSite: string;
  colorSize: string;
  customerPo: string;
  dueDate: string;
  structure: string;
  craft: string;
  yarn: string;
  items: TestItem[];
};

const EMPTY: Form = {
  styleId: "",
  stage: "DEV",
  entrust: "",
  agencyId: "",
  serviceLevel: "",
  standard: "",
  sampleQty: "",
  sampleSite: "",
  colorSize: "",
  customerPo: "",
  dueDate: "",
  structure: "",
  craft: "",
  yarn: "",
  items: [],
};

type NewTestDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function NewTestDialog({ open, onOpenChange }: NewTestDialogProps) {
  const { t } = useTranslation("testing");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle>{t("NEW_TITLE")}</DialogTitle>
        </DialogHeader>
        {open ? <NewTestBody onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewTestBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("testing");
  const { t: tc, i18n } = useTranslation();
  const navigate = useNavigate();
  const lookups = useLookups();
  const styles = useStyleOptionsQuery({});
  const reuse = useReuseCheckMutation();
  const create = useCreateTestMutation();
  const [form, setForm] = useState<Form>(EMPTY);
  const [check, setCheck] = useState<ReuseCheckResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "styleId" || key === "items" || key === "structure" || key === "craft" || key === "yarn")
      setCheck(null);
  };
  const toggleItem = (item: TestItem, on: boolean) =>
    set("items", on ? [...form.items, item] : form.items.filter((i) => i !== item));

  const reuseKey = () => {
    const key = {
      ...(form.structure.trim() ? { structure: form.structure.trim() } : {}),
      ...(form.craft.trim() ? { craft: form.craft.trim() } : {}),
      ...(form.yarn.trim() ? { yarn: form.yarn.trim() } : {}),
    };
    return Object.keys(key).length ? { reuseKey: key } : {};
  };

  function validate(): boolean {
    if (!form.styleId) return (setError(t("STYLE_REQUIRED")), false);
    if (!form.items.length) return (setError(t("ITEMS_REQUIRED")), false);
    setError(null);
    return true;
  }

  async function runCheck() {
    if (!validate()) return;
    try {
      setCheck(await reuse.mutateAsync({ styleId: form.styleId, items: form.items, ...reuseKey() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  async function submit(reuseReportId?: string) {
    if (!validate()) return;
    const qty = Number(form.sampleQty);
    try {
      const created = await create.mutateAsync({
        styleId: form.styleId,
        stage: form.stage,
        items: form.items,
        ...(form.entrust ? { entrust: form.entrust } : {}),
        ...(form.agencyId ? { agencyId: form.agencyId } : {}),
        ...(form.serviceLevel.trim() ? { serviceLevel: form.serviceLevel.trim() } : {}),
        ...(form.standard.trim() ? { standard: form.standard.trim() } : {}),
        ...(form.sampleQty.trim() && Number.isInteger(qty) ? { sampleQty: qty } : {}),
        ...(form.sampleSite.trim() ? { sampleSite: form.sampleSite.trim() } : {}),
        ...(form.colorSize.trim() ? { colorSize: form.colorSize.trim() } : {}),
        ...(form.customerPo.trim() ? { customerPo: form.customerPo.trim() } : {}),
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
        ...(reuseReportId ? { reuseReportId, ...reuseKey() } : {}),
      });
      toast.success(reuseReportId ? t("REUSED_OK", { no: created.docNo }) : t("CREATED_OK", { no: created.docNo }));
      onClose();
      void navigate(`/tests/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  const best = check?.candidates.find((c) => c.reusable) ?? null;
  const text = (key: keyof Form, label: string, type: "text" | "date" = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`nt-${key}`}>{label}</Label>
      <Input id={`nt-${key}`} type={type} value={form[key]} onChange={(e) => set(key, e.target.value as never)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nt-style">{t("F_STYLE")}</Label>
          <select
            className={selectClass}
            id="nt-style"
            value={form.styleId}
            onChange={(e) => set("styleId", e.target.value)}
          >
            <option value="">{t("PICK_STYLE")}</option>
            {(styles.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {`#${s.styleNo} · ${s.nameZh} · ${s.customerName}`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nt-stage">{t("F_STAGE")}</Label>
          <select
            className={selectClass}
            id="nt-stage"
            value={form.stage}
            onChange={(e) => set("stage", e.target.value as Form["stage"])}
          >
            <option value="DEV">{t("STAGE_DEV")}</option>
            <option value="BULK">{t("STAGE_BULK")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nt-agency">{t("F_AGENCY")}</Label>
          <select
            className={selectClass}
            id="nt-agency"
            value={form.agencyId}
            onChange={(e) => set("agencyId", e.target.value)}
          >
            <option value="">{t("PICK_AGENCY")}</option>
            {(lookups.data?.agencies ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nt-entrust">{t("F_ENTRUST")}</Label>
          <select
            className={selectClass}
            id="nt-entrust"
            value={form.entrust}
            onChange={(e) => set("entrust", e.target.value as Form["entrust"])}
          >
            <option value="">—</option>
            <option value="CUSTOMER_PLATFORM">{t("ENTRUST_CUSTOMER_PLATFORM")}</option>
            <option value="FACTORY">{t("ENTRUST_FACTORY")}</option>
          </select>
        </div>
        {text("serviceLevel", t("F_SERVICE"))}
        {text("standard", t("F_STANDARD"))}
        {text("sampleQty", t("F_SAMPLE_QTY"))}
        {text("sampleSite", t("F_SAMPLE_SITE"))}
        {text("colorSize", t("F_COLOR_SIZE"))}
        {text("customerPo", t("F_PO"))}
        {text("dueDate", t("F_DUE"), "date")}
        {text("structure", t("F_STRUCTURE"))}
        {text("craft", t("F_CRAFT"))}
        {text("yarn", t("F_YARN"))}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("F_ITEMS")}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {TEST_ITEMS.map((item) => (
            <label className="flex items-center gap-2 text-sm" htmlFor={`nt-item-${item}`} key={item}>
              <Checkbox
                checked={form.items.includes(item)}
                id={`nt-item-${item}`}
                onCheckedChange={(v) => toggleItem(item, v === true)}
              />
              {pickLabel(TEST_ITEM_LABELS[item], i18n.language)}
            </label>
          ))}
        </div>
      </fieldset>
      {check ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">{t("REUSE_TITLE")}</p>
          {best ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ToneBadge label={t("REUSE_AVAILABLE")} tone="success" />
                <span className="tabular font-medium">{best.report.docNo}</span>
                <span className="text-muted-foreground">{best.report.agencyReportNo}</span>
              </div>
              <ReuseChecks match={best} />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("REUSE_NONE")}</p>
              {check.candidates.slice(0, 3).map((c) => (
                <div className="rounded-md border border-border bg-card p-2" key={c.report.id}>
                  <p className="mb-1 text-xs font-medium">
                    {c.report.docNo} · {c.report.agencyReportNo} · {c.reasons.join("；")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button disabled={reuse.isPending} type="button" variant="outline" onClick={() => void runCheck()}>
          {t("REUSE_CHECK")}
        </Button>
        {best ? (
          <Button
            disabled={create.isPending}
            type="button"
            variant="outline"
            onClick={() => void submit(best.report.id)}
          >
            {t("REUSE_USE", { no: best.report.docNo })}
          </Button>
        ) : null}
        <Button disabled={create.isPending} type="button" onClick={() => void submit()}>
          {t("SAVE_DRAFT")}
        </Button>
      </DialogFooter>
    </div>
  );
}
