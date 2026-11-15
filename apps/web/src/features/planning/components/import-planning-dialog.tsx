import { LOW_CONFIDENCE } from "@otd/contracts/planning";
import { pickLabel } from "@otd/shared";
import { CheckCircle2, FileText, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { FileUpload, type UploadedFile } from "@/components/biz/file-upload";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { cn } from "@/lib/utils";

import { useDictLabel, useDictOptions } from "../dict";
import { useCreatePlanningMutation } from "../planning.mutations";

import type { PlanningDto } from "../planning.types";

const PREFILL = ["styleNo", "nameZh", "nameEn", "sizeRange", "requiredSampleDate"] as const;
type Prefill = (typeof PREFILL)[number];
type FormState = Record<Prefill | "customerId" | "seasonCode" | "category", string>;

const EMPTY: FormState = {
  customerId: "",
  seasonCode: "",
  category: "",
  styleNo: "",
  nameZh: "",
  nameEn: "",
  sizeRange: "",
  requiredSampleDate: "",
};

const RESULT_FIELDS = [
  "styleNo",
  "nameZh",
  "nameEn",
  "customerName",
  "seasonCode",
  "category",
  "subCategory",
  "sizeRange",
  "defaultSize",
  "needleCount",
  "sockWeight",
  "requiredSampleDate",
  "supplier",
  "designer",
] as const;

function formatSize(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type ImportPlanningDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function ImportPlanningDialog({ open, onOpenChange }: ImportPlanningDialogProps) {
  const { t } = useTranslation("planning");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{t("IMPORT_TITLE")}</DialogTitle>
        </DialogHeader>
        {open ? <ImportBody onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("planning");
  const { t: tc, i18n } = useTranslation();
  const navigate = useNavigate();
  const lookups = useLookups();
  const categories = useDictOptions("category", ["WOMEN", "MEN", "KIDS"]);
  const create = useCreatePlanningMutation();
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanningDto | null>(null);

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function start() {
    setError(null);
    if (!file) return setError(t("FILE_REQUIRED"));
    if (!form.customerId) return setError(t("CUSTOMER_REQUIRED"));
    const fields = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
    try {
      setResult(await create.mutateAsync({ ...fields, customerId: form.customerId, fileId: file.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  if (create.isPending) return <Recognizing filename={file?.filename ?? ""} />;
  if (result) {
    return (
      <ImportResult
        result={result}
        onClose={onClose}
        onOpen={() => {
          onClose();
          void navigate(`/planning/${result.id}`);
        }}
      />
    );
  }

  const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm";
  return (
    <div className="space-y-4">
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">{file.filename}</span>
          <span className="tabular text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <Button aria-label={t("FILE_REMOVE")} size="sm" variant="ghost" onClick={() => setFile(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <FileUpload accept=".pdf,.png,.jpg,.jpeg,.txt" hint={t("IMPORT_HINT")} onUploaded={setFile} />
      )}
      <p className="rounded-md bg-primary-soft/50 px-3 py-2 text-xs text-muted-foreground">{t("IMPORT_NOTE")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="imp-customer">{t("F_customer")}</Label>
          <select
            className={selectClass}
            id="imp-customer"
            value={form.customerId}
            onChange={(e) => set("customerId", e.target.value)}
          >
            <option value="">{t("PICK_CUSTOMER")}</option>
            {(lookups.data?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imp-season">{t("F_seasonCode")}</Label>
          <select
            className={selectClass}
            id="imp-season"
            value={form.seasonCode}
            onChange={(e) => set("seasonCode", e.target.value)}
          >
            <option value="">{t("AUTO_DETECT")}</option>
            {(lookups.data?.seasons ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {`${pickLabel(s.label, i18n.language)}（${s.code}）`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imp-category">{t("F_category")}</Label>
          <select
            className={selectClass}
            id="imp-category"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">{t("AUTO_DETECT")}</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {PREFILL.map((key) => (
          <div className="space-y-1.5" key={key}>
            <Label htmlFor={`imp-${key}`}>{t(`F_${key}`)}</Label>
            <Input
              id={`imp-${key}`}
              placeholder={t("AUTO_DETECT")}
              type={key === "requiredSampleDate" ? "date" : "text"}
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("ZCYE20")}
        </Button>
        <Button type="button" onClick={() => void start()}>
          {t("START")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Recognizing({ filename }: { filename: string }) {
  const { t } = useTranslation("planning");
  return (
    <div className="space-y-4 py-2" role="status">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        <span className="font-medium">{filename}</span>
      </div>
      <ol className="grid grid-cols-3 gap-2 text-xs">
        {(["STEP_UPLOAD", "STEP_EXTRACT", "STEP_TRANSLATE"] as const).map((key, index) => (
          <li
            className={cn(
              "rounded-md border px-2 py-1.5 text-center",
              index === 0 ? "border-primary/40 bg-primary-soft text-primary" : "border-border text-muted-foreground",
            )}
            key={key}
          >
            {t(key)}
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        {t("RECOGNIZING_MSG")}
      </div>
    </div>
  );
}

function ImportResult({ result, onClose, onOpen }: { result: PlanningDto; onClose: () => void; onOpen: () => void }) {
  const { t } = useTranslation("planning");
  const dict = useDictLabel();
  if (result.status !== "EXTRACTED") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StatusBadge code={result.status} machine="planning" />
          <span className="tabular text-sm text-muted-foreground">{result.docNo}</span>
        </div>
        <Alert variant="destructive">
          <AlertDescription>
            {t("FAILED_TITLE")}：{result.recognitionError ?? "—"}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("LATER")}
          </Button>
          <Button onClick={onOpen}>{t("OPEN_DETAIL")}</Button>
        </DialogFooter>
      </div>
    );
  }
  const extraction = result.extraction ?? {};
  const scored = Object.values(extraction).filter((f) => f.value !== null && f.value !== "");
  const avg = scored.length ? Math.round((scored.reduce((s, f) => s + f.confidence, 0) / scored.length) * 100) : 0;
  const display = (key: (typeof RESULT_FIELDS)[number]): string | null => {
    if (key === "customerName") return result.customerName;
    const value = result[key];
    if (key === "category") return value ? dict("category", value) : null;
    if (key === "subCategory") return value ? dict("subCategory", value) : null;
    return value;
  };
  const rows = [
    ...RESULT_FIELDS.map((key) => ({
      key,
      label: t(`F_${key}`),
      zh: display(key),
      original: extraction[key]?.source ?? (extraction[key]?.value != null ? String(extraction[key]?.value) : null),
      confidence: extraction[key]?.confidence ?? null,
    })),
    ...result.productAttrs.map((a) => ({
      key: `attr.${a.key}`,
      label: t(`ATTR_${a.key}`),
      zh: a.translated,
      original: a.original,
      confidence: a.confidence,
    })),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge code={result.status} machine="planning" />
        <ToneBadge label={t("CONF_AVG", { value: avg })} tone="success" />
        {result.lowConfidenceFields.length ? (
          <ToneBadge label={t("LOW_COUNT", { count: result.lowConfidenceFields.length })} tone="warning" />
        ) : null}
        <span className="tabular text-sm text-muted-foreground">{result.docNo}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("COL_FIELD")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("COL_ZH")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("COL_ORIGINAL")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("COL_CONF")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const low = row.confidence !== null && row.confidence < LOW_CONFIDENCE && !!row.zh;
              return (
                <tr
                  className={cn("border-t border-border", low && "bg-warning/10")}
                  data-low={low || undefined}
                  key={row.key}
                >
                  <td className="px-3 py-2 text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-2">{row.zh || <span className="text-muted-foreground">{t("BLANK")}</span>}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground">{row.original ?? "—"}</td>
                  <td className={cn("tabular px-3 py-2 text-right", low && "font-medium text-warning")}>
                    {row.confidence !== null && row.zh ? `${Math.round(row.confidence * 100)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("LATER")}
        </Button>
        <Button onClick={onOpen}>{t("CREATE_REVIEW")}</Button>
      </DialogFooter>
    </div>
  );
}
