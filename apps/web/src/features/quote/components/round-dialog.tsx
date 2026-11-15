import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { pct, usd, yuan } from "../quote.format";
import { useCreateRoundMutation } from "../quote.mutations";
import { useQuotePreviewQuery, useStrategiesQuery } from "../quote.queries";

import type { QuoteDto, QuotePreviewInput, QuoteRoundKind } from "../quote.types";
import type { ReactNode } from "react";

type RoundDialogProps = { quote: QuoteDto; open: boolean; onOpenChange: (open: boolean) => void; canCost: boolean };

function useDebounced<T>(value: T, delay: number): T {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCurrent(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return current;
}

function CheckRow({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: ReactNode }) {
  const Icon = ok ? CircleCheck : warn ? CircleAlert : CircleX;
  return (
    <li className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm" data-ok={ok}>
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", ok ? "text-success" : warn ? "text-warning" : "text-danger")}
      />
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">{detail}</span>
    </li>
  );
}

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

function Stat({ label, value, tone }: { label: string; value: string; tone?: keyof typeof TONE_TEXT | undefined }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular text-lg font-semibold", tone && TONE_TEXT[tone])}>{value}</p>
    </div>
  );
}

function RoundForm({ quote, canCost, onDone }: { quote: QuoteDto; canCost: boolean; onDone: () => void }) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const strategies = useStrategiesQuery();
  const create = useCreateRoundMutation();
  const latest = quote.latestCustomerRound;
  const [kind, setKind] = useState<QuoteRoundKind>("CUSTOMER");
  const [quantity, setQuantity] = useState(String(latest?.quantity ?? quote.moq ?? ""));
  const [price, setPrice] = useState(latest ? latest.priceCny.toFixed(2) : "");
  const [strategyId, setStrategyId] = useState(quote.strategy?.id ?? "");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const qty = Number(quantity);
  const priceCny = Number(price);
  const valid = Number.isInteger(qty) && qty > 0 && (kind === "INTERNAL" || priceCny > 0);
  const input = useMemo<QuotePreviewInput | null>(
    () =>
      valid
        ? {
            quoteId: quote.id,
            quantity: qty,
            ...(strategyId ? { strategyId } : {}),
            ...(kind === "CUSTOMER" ? { priceCny } : {}),
          }
        : null,
    [valid, quote.id, qty, strategyId, kind, priceCny],
  );
  const debounced = useDebounced(input, 250);
  const preview = useQuotePreviewQuery(debounced);
  const settled = JSON.stringify(debounced) === JSON.stringify(input) && !preview.isFetching;
  const data = preview.data;
  const check = kind === "CUSTOMER" ? (data?.check ?? null) : null;
  const needsOverride = check !== null && !check.guardrailPassed;
  const reasonOk = !needsOverride || reason.trim().length >= 2;
  const canSubmit =
    valid &&
    settled &&
    !preview.error &&
    !create.isPending &&
    (kind === "INTERNAL" ? canCost : check !== null && check.canSubmit && reasonOk);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        id: quote.id,
        input: {
          kind,
          quantity: qty,
          ...(strategyId ? { strategyId } : {}),
          ...(kind === "CUSTOMER" ? { priceCny } : {}),
          note: note.trim() || null,
          ...(needsOverride ? { overrideReason: reason.trim() } : {}),
          version: quote.version,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <div className="space-y-4">
      {canCost ? (
        <div className="inline-flex rounded-lg bg-muted p-1" role="radiogroup" aria-label={t("ROUND_KIND")}>
          {(["CUSTOMER", "INTERNAL"] as const).map((k) => (
            <button
              aria-checked={kind === k}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium",
                kind === k ? "bg-background shadow" : "text-muted-foreground",
              )}
              key={k}
              role="radio"
              type="button"
              onClick={() => setKind(k)}
            >
              {k === "CUSTOMER" ? t("KIND_CUSTOMER") : t("KIND_INTERNAL")}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="round-qty">{t("ROUND_QTY")}</Label>
          <Input
            className="tabular"
            id="round-qty"
            inputMode="numeric"
            min={1}
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        {kind === "CUSTOMER" ? (
          <div className="space-y-1.5">
            <Label htmlFor="round-price">{t("ROUND_PRICE")}</Label>
            <Input
              className="tabular"
              id="round-price"
              min={0}
              step="0.01"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="round-strategy">{t("STRATEGY")}</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            id="round-strategy"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
          >
            {(strategies.data ?? [])
              .filter((s) => s.enabled || s.id === strategyId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="round-fx">{t("LOCKED_FX")}</Label>
          <Input disabled className="tabular" id="round-fx" value={data?.fx ?? ""} />
        </div>
      </div>

      {preview.error ? (
        <Alert variant="destructive">
          <AlertDescription>{preview.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {kind === "CUSTOMER" && check ? (
        <section aria-label={t("CHECK_TITLE")} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("PRICE_USD")} value={usd(check.priceUsd)} />
            {check.margin !== undefined ? (
              <Stat
                label={t("MARGIN")}
                tone={check.guardrailPassed ? (check.targetMarginMet ? "success" : "warning") : "danger"}
                value={pct(check.margin)}
              />
            ) : (
              <Stat
                label={t("GUARDRAIL_CHECK")}
                tone={check.guardrailPassed ? "success" : "danger"}
                value={check.guardrailPassed ? t("PASS") : t("FAIL")}
              />
            )}
            <Stat
              label={t("VS_TARGET")}
              tone={check.diffToTargetUsd === null ? undefined : check.diffToTargetUsd >= 0 ? "success" : "danger"}
              value={
                check.diffToTargetUsd === null
                  ? "—"
                  : `${check.diffToTargetUsd >= 0 ? "+" : "-"}$${Math.abs(check.diffToTargetUsd).toFixed(2)}`
              }
            />
          </div>
          <ul className="space-y-2">
            <CheckRow
              detail={check.margin !== undefined ? pct(check.margin) : check.guardrailPassed ? t("PASS") : t("FAIL")}
              label={t("CHECK_GUARDRAIL", { value: pct(check.guardrail) })}
              ok={check.guardrailPassed}
            />
            <CheckRow
              detail={check.targetMarginMet ? t("MET") : t("TARGET_MISSED")}
              label={t("CHECK_TARGET_MARGIN", { value: pct(check.targetMargin) })}
              ok={check.targetMarginMet}
              warn
            />
            <CheckRow
              detail={check.belowMoq ? t("BELOW_MOQ") : t("OK")}
              label={t("CHECK_MOQ", { value: check.moq.toLocaleString() })}
              ok={!check.belowMoq}
              warn
            />
            {check.targetPriceUsd !== null ? (
              <CheckRow
                detail={check.overTargetTolerance ? t("OVER_TOLERANCE") : t("OK")}
                label={t("CHECK_TARGET_PRICE", { value: usd(check.targetPriceUsd) })}
                ok={!check.overTargetTolerance}
                warn
              />
            ) : null}
          </ul>
          {needsOverride ? (
            check.canOverride ? (
              <div className="space-y-1.5">
                <Label htmlFor="round-reason">{t("OVERRIDE_REASON")}</Label>
                <Textarea id="round-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>{t("GUARDRAIL_BLOCKED")}</AlertDescription>
              </Alert>
            )
          ) : null}
        </section>
      ) : null}

      {kind === "INTERNAL" && data?.suggested ? (
        <section aria-label={t("SUGGESTED_TITLE")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("COST_TOTAL")} value={yuan(data.costTotal)} />
          <Stat label={t("BASE_PRICE")} value={yuan(data.suggested.basePrice)} />
          <Stat
            label={t("ADJUSTMENT")}
            value={`+${pct(data.suggested.upliftRate, 0)} / -${pct(data.suggested.discountRate, 0)}`}
          />
          <Stat
            label={t("INTERNAL_PRICE")}
            tone="success"
            value={`${yuan(data.suggested.suggestedPrice)} ｜ ${usd(data.suggested.priceUsd)}`}
          />
        </section>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="round-note">{t("NOTE")}</Label>
        <Textarea id="round-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tc("ZCYE20")}
        </Button>
        <Button
          disabled={!canSubmit}
          title={needsOverride && !check?.canOverride ? t("GUARDRAIL_BLOCKED") : undefined}
          type="button"
          onClick={() => void submit()}
        >
          {create.isPending ? tc("SBWT01") : t("ROUND_SUBMIT")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function RoundDialog({ quote, open, onOpenChange, canCost }: RoundDialogProps) {
  const { t } = useTranslation("quote");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("ROUND_TITLE", { styleNo: quote.styleNo })}</DialogTitle>
          <DialogDescription>{t("ROUND_DESC")}</DialogDescription>
        </DialogHeader>
        {open ? <RoundForm canCost={canCost} quote={quote} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
