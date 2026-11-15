import { pickLabel } from "@otd/shared";
import { Download, FileSpreadsheet, Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { FileUpload } from "@/components/biz/file-upload";
import { StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CostItemsDialog } from "@/features/quote/components/cost-items-dialog";
import { QuoteFormDialog } from "@/features/quote/components/quote-form-dialog";
import { RoundDialog } from "@/features/quote/components/round-dialog";
import { pct, tierText, usd, yuan } from "@/features/quote/quote.format";
import {
  downloadFile,
  downloadQuoteExport,
  useArchiveQuoteMutation,
  useAttachQuoteFileMutation,
  useRoundFeedbackMutation,
} from "@/features/quote/quote.mutations";
import { useQuoteQuery } from "@/features/quote/quote.queries";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

import type { FieldItem } from "@/components/biz/field-grid";
import type { QuoteDto, QuoteExportForm, QuoteRoundDto } from "@/features/quote/quote.types";

const TH = "h-10 px-3 text-left font-medium whitespace-nowrap";
const TD = "px-3 py-2.5 whitespace-nowrap";

function DiffText({ diff }: { diff: number | null }) {
  const { t } = useTranslation("quote");
  if (diff === null) return <span className="text-muted-foreground">—</span>;
  const text =
    diff < 0 ? t("DIFF_LOW", { value: Math.abs(diff).toFixed(2) }) : t("DIFF_HIGH", { value: diff.toFixed(2) });
  return <span className={cn("font-medium", diff < 0 ? "text-danger" : "text-success")}>{text}</span>;
}

function CustomerRounds({
  quote,
  canFeedback,
  onFeedback,
}: {
  quote: QuoteDto;
  canFeedback: boolean;
  onFeedback: (round: QuoteRoundDto, result: "ACCEPTED" | "REJECTED") => void;
}) {
  const { t } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const rows = [...quote.customerRounds].reverse();
  const withMargin = rows.some((r) => r.margin !== undefined);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t("NO_CUSTOMER_ROUNDS")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className={TH}>{t("ROUND")}</th>
            <th className={TH}>{t("QUOTE_NO")}</th>
            <th className={cn(TH, "text-right")}>{t("PRICE_CNY")}</th>
            <th className={cn(TH, "text-right")}>{t("PRICE_USD")}</th>
            <th className={cn(TH, "text-right")}>{t("QUANTITY")}</th>
            <th className={TH}>{t("STRATEGY")}</th>
            {withMargin ? <th className={cn(TH, "text-right")}>{t("MARGIN")}</th> : null}
            <th className={TH}>{t("GUARDRAIL_CHECK")}</th>
            <th className={TH}>{t("VS_TARGET")}</th>
            <th className={TH}>{t("STATUS")}</th>
            <th className={TH}>{t("QUOTED_BY")}</th>
            <th className={TH}>{t("DATE")}</th>
            <th className={TH}>{t("NOTE")}</th>
            <th className={TH}>{tc("TBL_ACTIONS")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr className="border-t border-border" key={r.id}>
              <td className={TD}>
                <span className="font-semibold">{t("ROUND_N", { n: r.seq })}</span>
                {r.isLatest ? <ToneBadge className="ml-1.5" label={t("LATEST")} tone="info" /> : null}
              </td>
              <td className={cn(TD, "tabular")}>{r.docNo}</td>
              <td className={cn(TD, "tabular text-right font-semibold")}>{yuan(r.priceCny)}</td>
              <td className={cn(TD, "tabular text-right")}>{usd(r.priceUsd)}</td>
              <td className={cn(TD, "tabular text-right")}>{r.quantity.toLocaleString()}</td>
              <td className={TD}>{r.strategyCode ?? "—"}</td>
              {withMargin ? <td className={cn(TD, "tabular text-right")}>{pct(r.margin)}</td> : null}
              <td className={TD}>
                {r.guardrailPassed ? (
                  <ToneBadge label={t("PASS")} tone="success" />
                ) : (
                  <ToneBadge
                    label={r.overrideReason ? t("OVERRIDDEN") : t("FAIL")}
                    tone={r.overrideReason ? "warning" : "danger"}
                  />
                )}
              </td>
              <td className={TD}>
                <DiffText diff={r.diffToTargetUsd} />
              </td>
              <td className={TD}>
                <StatusBadge code={r.status} machine="quoteRound" />
              </td>
              <td className={TD}>{r.quotedByName ?? "—"}</td>
              <td className={cn(TD, "tabular text-muted-foreground")}>{formatDate(r.quotedAt)}</td>
              <td
                className="max-w-72 px-3 py-2.5 text-muted-foreground"
                title={r.overrideReason ?? r.feedbackNote ?? undefined}
              >
                {r.note ?? r.feedbackNote ?? "—"}
              </td>
              <td className={TD}>
                {canFeedback && r.isLatest && r.status === "QUOTED" ? (
                  <span className="flex gap-1">
                    <Button className="h-auto px-1.5 py-0.5" variant="link" onClick={() => onFeedback(r, "ACCEPTED")}>
                      {t("ACCEPT")}
                    </Button>
                    <Button
                      className="h-auto px-1.5 py-0.5 text-destructive"
                      variant="link"
                      onClick={() => onFeedback(r, "REJECTED")}
                    >
                      {t("REJECT")}
                    </Button>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InternalRounds({ rounds }: { rounds: QuoteRoundDto[] }) {
  const { t } = useTranslation("quote");
  if (!rounds.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("NO_INTERNAL_ROUNDS")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className={TH}>{t("ROUND")}</th>
            <th className={TH}>{t("QUOTE_NO")}</th>
            <th className={cn(TH, "text-right")}>{t("INTERNAL_CNY")}</th>
            <th className={cn(TH, "text-right")}>{t("INTERNAL_USD")}</th>
            <th className={cn(TH, "text-right")}>{t("QUANTITY")}</th>
            <th className={TH}>{t("STRATEGY")}</th>
            <th className={cn(TH, "text-right")}>{t("MARKUP_MARGIN")}</th>
            <th className={TH}>{t("STATUS")}</th>
            <th className={TH}>{t("QUOTED_BY")}</th>
            <th className={TH}>{t("DATE")}</th>
            <th className={TH}>{t("NOTE")}</th>
          </tr>
        </thead>
        <tbody>
          {[...rounds].reverse().map((r) => (
            <tr className="border-t border-border" key={r.id}>
              <td className={TD}>
                <span className="font-semibold">{t("ROUND_N", { n: r.seq })}</span>
                {r.isLatest ? <ToneBadge className="ml-1.5" label={t("LATEST")} tone="info" /> : null}
              </td>
              <td className={cn(TD, "tabular")}>{r.docNo}</td>
              <td className={cn(TD, "tabular text-right font-semibold")}>{yuan(r.priceCny)}</td>
              <td className={cn(TD, "tabular text-right")}>{usd(r.priceUsd)}</td>
              <td className={cn(TD, "tabular text-right")}>{r.quantity.toLocaleString()}</td>
              <td className={TD}>{r.strategyCode ?? "—"}</td>
              <td className={cn(TD, "tabular text-right")}>{pct(r.margin)}</td>
              <td className={TD}>
                <StatusBadge code={r.status} machine="quoteRound" />
              </td>
              <td className={TD}>{r.quotedByName ?? "—"}</td>
              <td className={cn(TD, "tabular text-muted-foreground")}>{formatDate(r.quotedAt)}</td>
              <td className="max-w-72 px-3 py-2.5 text-muted-foreground">{r.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function headerFields(quote: QuoteDto, t: (key: string, options?: Record<string, unknown>) => string): FieldItem[] {
  const s = quote.strategy;
  const b = quote.costBreakdown;
  const latest = quote.latestCustomerRound;
  const fields: FieldItem[] = [
    { label: t("STYLE_NO"), value: `#${quote.styleNo}` },
    { label: t("STYLE_NAME"), value: quote.styleName },
    { label: t("SEASON"), value: quote.seasonCode },
    { label: t("CUSTOMER"), value: quote.customerName },
    { label: t("FACTORY"), value: quote.factoryName },
    { label: t("MOQ"), value: quote.moq !== null ? t("PAIRS", { value: quote.moq.toLocaleString() }) : null },
  ];
  if (quote.costTotal !== undefined) {
    fields.push({
      label: t("COST_TOTAL"),
      value:
        quote.costTotal !== null ? <b className="tabular">{t("PER_PAIR", { value: yuan(quote.costTotal) })}</b> : null,
    });
    fields.push({
      label: t("COST_BREAKDOWN"),
      span: 2,
      value: b
        ? t("BREAKDOWN_TEXT", {
            yarn: yuan(b.yarn),
            loss: Math.round(b.yarnLossRate * 100),
            labor: yuan(b.labor),
            trims: yuan(b.trims),
            other: yuan(b.other),
          })
        : null,
    });
  }
  fields.push(
    {
      label: t("TARGET_PRICE"),
      value:
        quote.targetPriceUsd !== null
          ? `${usd(quote.targetPriceUsd)}${quote.targetPriceCny !== null ? ` ｜ ¥${yuan(quote.targetPriceCny)}（${t("LOCKED_FX")} ${quote.targetFx}）` : ""}`
          : null,
    },
    {
      label: t("TARGET_REGISTER"),
      value:
        quote.targetSource || quote.targetDate
          ? `${quote.targetSource ?? "—"} · ${formatDate(quote.targetDate)}`
          : null,
    },
    { label: t("STRATEGY"), value: s ? `${s.code} · ${s.name}` : null },
    {
      label: t("STRATEGY_PARAMS"),
      span: 2,
      value: s
        ? t(s.method === "MARKUP" ? "PARAMS_MARKUP" : "PARAMS_MARGIN", {
            loss: pct(s.lossRate, 0),
            overhead: pct(s.overheadRate, 0),
            markup: pct(s.markupRate, 0),
            target: pct(s.targetMargin, 0),
            guardrail: pct(s.guardrail, 0),
            fx: s.lockedFx,
          })
        : null,
    },
    {
      label: t("MOQ_UPLIFT"),
      value: s ? t("MOQ_UPLIFT_TEXT", { moq: s.moq.toLocaleString(), uplift: pct(s.smallOrderUplift, 0) }) : null,
    },
    { label: t("SKU_TIERS"), value: s ? (s.skuTiers.length ? tierText(s.skuTiers, t("UNIT_WAN")) : t("NONE")) : null },
  );
  if (quote.internalPrice !== undefined) {
    fields.push({
      label: t("INTERNAL_PRICE"),
      value: quote.internalPrice
        ? `${t("PER_PAIR", { value: yuan(quote.internalPrice.priceCny) })} ｜ ${usd(quote.internalPrice.priceUsd)}`
        : null,
    });
  }
  fields.push(
    {
      label: t("LATEST_CUSTOMER_PRICE"),
      value: latest ? (
        <b className="tabular">
          {t("PER_PAIR", { value: yuan(latest.priceCny) })} ｜ {usd(latest.priceUsd)}
          {latest.margin !== undefined ? ` ｜ ${t("MARGIN")} ${pct(latest.margin)}` : ""}
        </b>
      ) : null,
    },
    { label: t("VS_TARGET"), value: latest ? <DiffText diff={latest.diffToTargetUsd} /> : null },
    { label: t("NOTE"), value: quote.note, span: "full" },
  );
  return fields;
}

export function QuoteDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("quote");
  const { t: tc } = useTranslation();
  const { hasPermission } = useAuth();
  const quoteQuery = useQuoteQuery(id);
  const archive = useArchiveQuoteMutation();
  const feedback = useRoundFeedbackMutation();
  const attach = useAttachQuoteFileMutation();
  const [roundOpen, setRoundOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pending, setPending] = useState<{ round: QuoteRoundDto; result: "ACCEPTED" | "REJECTED" } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState("customer");
  const { leaf, group } = leafByPermission("quote.quote.view");

  if (quoteQuery.isLoading) return <LoadingState />;
  if (quoteQuery.error || !quoteQuery.data) return <ErrorState error={quoteQuery.error ?? new Error(tc("STERR"))} />;
  const quote = quoteQuery.data;
  const canCost = quote.costTotal !== undefined;
  const frozen = quote.handoverStatus === "HANDED_OVER";
  const locked = frozen || Boolean(quote.archivedAt);
  const tr = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const forms: { form: QuoteExportForm; name: string; template: string; scope: string }[] = [
    {
      form: "summary",
      name: t("FORM_SUMMARY"),
      template: t("FORM_SUMMARY_TEMPLATE"),
      scope: t("FORM_SUMMARY_SCOPE", {
        total: quote.roundCounts.internal + quote.roundCounts.customer,
        internal: quote.roundCounts.internal,
        customer: quote.roundCounts.customer,
      }),
    },
    ...(canCost
      ? [
          {
            form: "cost-detail" as const,
            name: t("FORM_COST"),
            template: t("FORM_COST_TEMPLATE"),
            scope: t("FORM_COST_SCOPE", {
              items: quote.costItems?.length ?? 0,
              loss: Math.round((quote.costBreakdown?.yarnLossRate ?? 0) * 100),
            }),
          },
        ]
      : []),
  ];

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : tc("BIZERR"));
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <RequirePermission code="quote.quote.submit">
              <Button disabled={locked} onClick={() => setRoundOpen(true)}>
                {t("ROUND_NEW")}
              </Button>
            </RequirePermission>
            <RequirePermission code="quote.quote.create">
              <Button disabled={locked} variant="outline" onClick={() => setEditOpen(true)}>
                {tc("1VV96U")}
              </Button>
            </RequirePermission>
            <RequirePermission code="quote.quote.archive">
              <Button disabled={Boolean(quote.archivedAt)} variant="outline" onClick={() => setArchiving(true)}>
                {t("ARCHIVE")}
              </Button>
            </RequirePermission>
          </>
        }
        crumbs={[
          { label: pickLabel(group.label, i18n.language) },
          { label: pickLabel(leaf.label, i18n.language), to: "/quotes" },
          { label: quote.styleNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      {actionError ? (
        <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
          {actionError}
        </p>
      ) : null}
      <DetailHeaderCard
        fields={headerFields(quote, tr)}
        subtitle={[
          quote.productCode,
          quote.factoryName,
          quote.moq !== null ? `${t("MOQ")} ${t("PAIRS", { value: quote.moq.toLocaleString() })}` : null,
        ]
          .filter(Boolean)
          .join(" ｜ ")}
        tags={
          <>
            <ToneBadge label={quote.customerName} tone="info" />
            <StatusBadge code={quote.status} machine="quoteRound" />
            {quote.strategy ? <ToneBadge label={quote.strategy.code} tone="success" /> : null}
            {quote.seasonCode ? <ToneBadge label={quote.seasonCode} /> : null}
            {frozen ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock aria-hidden="true" className="size-3.5" />
                {t("FROZEN")}
              </span>
            ) : null}
            {quote.archivedAt ? <ToneBadge label={t("ARCHIVED")} /> : null}
          </>
        }
        title={`#${quote.styleNo} · ${quote.styleName}`}
      />

      <SectionCard bodyClassName="p-0" title={t("ROUNDS_TITLE")}>
        <Tabs value={tab} onValueChange={setTab}>
          <div className="border-b border-border px-5 py-2">
            <TabsList>
              {quote.internalRounds !== undefined ? (
                <TabsTrigger value="internal">{t("TAB_INTERNAL", { count: quote.roundCounts.internal })}</TabsTrigger>
              ) : null}
              <TabsTrigger value="customer">{t("TAB_CUSTOMER", { count: quote.roundCounts.customer })}</TabsTrigger>
            </TabsList>
          </div>
          {quote.internalRounds !== undefined ? (
            <TabsContent className="mt-0" value="internal">
              <InternalRounds rounds={quote.internalRounds} />
            </TabsContent>
          ) : null}
          <TabsContent className="mt-0" value="customer">
            <CustomerRounds
              canFeedback={hasPermission("quote.quote.feedback") && !locked}
              quote={quote}
              onFeedback={(round, result) => setPending({ round, result })}
            />
          </TabsContent>
        </Tabs>
      </SectionCard>

      {quote.costItems !== undefined ? (
        <SectionCard
          bodyClassName="p-0"
          extra={
            <RequirePermission code="quote.quote.create">
              <Button disabled={locked} size="sm" variant="outline" onClick={() => setCostOpen(true)}>
                {t("COST_EDIT")}
              </Button>
            </RequirePermission>
          }
          title={t("COST_TITLE")}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className={TH}>{t("COST_CATEGORY")}</th>
                  <th className={TH}>{t("COST_NAME")}</th>
                  <th className={TH}>{t("COST_SPEC")}</th>
                  <th className={cn(TH, "text-right")}>{t("COST_QTY")}</th>
                  <th className={cn(TH, "text-right")}>{t("COST_UNIT_PRICE")}</th>
                  <th className={cn(TH, "text-right")}>{t("COST_AMOUNT")}</th>
                </tr>
              </thead>
              <tbody>
                {quote.costItems.map((item) => (
                  <tr className="border-t border-border" key={item.id}>
                    <td className={TD}>{t(`CAT_${item.category}`)}</td>
                    <td className={TD}>{item.name}</td>
                    <td className={cn(TD, "text-muted-foreground")}>{item.spec ?? "—"}</td>
                    <td className={cn(TD, "tabular text-right")}>{item.quantity ?? "—"}</td>
                    <td className={cn(TD, "tabular text-right")}>{item.unitPrice ?? "—"}</td>
                    <td className={cn(TD, "tabular text-right")}>{item.amount.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
              {quote.costBreakdown ? (
                <tfoot>
                  <tr className="border-t border-border bg-muted/40">
                    <td className="px-3 py-2.5 text-sm" colSpan={6}>
                      {t("BREAKDOWN_TEXT", {
                        yarn: yuan(quote.costBreakdown.yarn),
                        loss: Math.round(quote.costBreakdown.yarnLossRate * 100),
                        labor: yuan(quote.costBreakdown.labor),
                        trims: yuan(quote.costBreakdown.trims),
                        other: yuan(quote.costBreakdown.other),
                      })}{" "}
                      = <b className="tabular">{t("PER_PAIR", { value: yuan(quote.costTotal) })}</b>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t("MATERIALS_TITLE")}>
        <div className="space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-medium">{t("TEMPLATE_FILES")}</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quote.files.map((file) => (
                <div className="flex items-center gap-3 rounded-md border border-border p-3" key={file.id}>
                  <FileSpreadsheet aria-hidden="true" className="size-5 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {quote.customerName} · {formatDate(file.createdAt)}
                    </p>
                  </div>
                  <Button
                    aria-label={t("DOWNLOAD_FILE", { name: file.filename })}
                    size="icon"
                    variant="ghost"
                    onClick={() => void runAction(() => downloadFile(file.id, file.filename, file.contentType))}
                  >
                    <Download aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              ))}
              {!quote.files.length ? <p className="text-sm text-muted-foreground">{t("NO_FILES")}</p> : null}
            </div>
            {hasPermission("quote.quote.create") && !locked ? (
              <FileUpload
                className="mt-3"
                hint={t("UPLOAD_TEMPLATE_HINT")}
                onUploaded={(file) =>
                  void runAction(() => attach.mutateAsync({ id: quote.id, fileId: file.id, version: quote.version }))
                }
              />
            ) : null}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">{t("EXPORT_FORMS")}</h4>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className={TH}>{t("FORM_NAME")}</th>
                    <th className={TH}>{t("FORM_TEMPLATE")}</th>
                    <th className={TH}>{t("FORM_SCOPE")}</th>
                    <th className={TH}>{tc("TBL_ACTIONS")}</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((f) => (
                    <tr className="border-t border-border" key={f.form}>
                      <td className={cn(TD, "font-medium")}>{f.name}</td>
                      <td className={TD}>{f.template}</td>
                      <td className={cn(TD, "text-muted-foreground")}>{f.scope}</td>
                      <td className={TD}>
                        <Button
                          className="h-auto px-0"
                          variant="link"
                          onClick={() =>
                            void runAction(() =>
                              downloadQuoteExport(quote.id, f.form, `QT-${quote.styleNo} ${f.name}.xlsx`),
                            )
                          }
                        >
                          {t("DOWNLOAD")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      <RoundDialog canCost={canCost} open={roundOpen} quote={quote} onOpenChange={setRoundOpen} />
      <QuoteFormDialog open={editOpen} quote={quote} onOpenChange={setEditOpen} />
      {canCost ? <CostItemsDialog open={costOpen} quote={quote} onOpenChange={setCostOpen} /> : null}
      <ConfirmDialog
        description={t("ARCHIVE_CONFIRM", { styleNo: quote.styleNo })}
        isProcessing={archive.isPending}
        open={archiving}
        title={t("ARCHIVE")}
        onConfirm={() =>
          runAction(async () => {
            await archive.mutateAsync({ id: quote.id, version: quote.version });
            setArchiving(false);
          })
        }
        onOpenChange={setArchiving}
      />
      <ConfirmDialog
        description={
          pending
            ? t(pending.result === "ACCEPTED" ? "ACCEPT_CONFIRM" : "REJECT_CONFIRM", { docNo: pending.round.docNo })
            : undefined
        }
        isProcessing={feedback.isPending}
        open={pending !== null}
        title={pending?.result === "REJECTED" ? t("REJECT") : t("ACCEPT")}
        variant={pending?.result === "REJECTED" ? "destructive" : "default"}
        onConfirm={() =>
          runAction(async () => {
            if (!pending) return;
            await feedback.mutateAsync({
              id: quote.id,
              roundId: pending.round.id,
              result: pending.result,
              version: pending.round.version,
            });
            setPending(null);
          })
        }
        onOpenChange={(open) => !open && setPending(null)}
      />
    </section>
  );
}
