import { pickLabel, statusLabel } from "@otd/shared";
import { AlertTriangle, ArrowRight, Radar, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useHasPermission } from "@/app/providers/auth-provider";
import { RequirePermission } from "@/app/router/guards";
import { DetailHeaderCard, SectionCard } from "@/components/biz/detail-header-card";
import { Money } from "@/components/biz/money";
import { PrimaryTag, StatusBadge, ToneBadge } from "@/components/biz/status-badge";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { leafByPermission } from "@/components/common/placeholder-page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dictionaryOptions, useLookups } from "@/features/masterdata/lookups.queries";
import { ConfirmOrderDialog } from "@/features/order/components/confirm-order-dialog";
import {
  AdvanceOrderDialog,
  CancelOrderDialog,
  CustomerConfirmDialog,
  FactoryReplyDialog,
  ProductionDialog,
} from "@/features/order/components/order-action-dialogs";
import { EditOrderDialog, ReviseOrderDialog } from "@/features/order/components/order-form-dialog";
import { OrderStageTimeline } from "@/features/order/components/order-stage-timeline";
import { RuleCheckList, ruleSummary } from "@/features/order/components/rule-check-list";
import { useRecheckOrderMutation } from "@/features/order/order.mutations";
import { useOrderQuery } from "@/features/order/order.queries";
import { formatDate } from "@/lib/date";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { FieldItem } from "@/components/biz/field-grid";
import type { OrderDetail } from "@/features/order/order.types";
import type { ReactNode } from "react";

type DialogKind = "confirm" | "advance" | "reply" | "customer" | "cancel" | "production" | "edit" | "revise";

const PRODUCING = new Set(["TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"]);
const OPEN = new Set(["PENDING_CONFIRM", "TO_SCHEDULE", "IN_PRODUCTION", "TO_SHIP"]);

function SimpleTable({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h) => (
            <TableHead className="whitespace-nowrap" key={h}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((cells, index) => (
          <TableRow key={index}>
            {cells.map((cell, j) => (
              <TableCell className="whitespace-nowrap" key={j}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation("order");
  const order = useOrderQuery(id);
  if (order.isLoading) return <LoadingState />;
  if (order.error || !order.data) return <ErrorState error={order.error} title={t("DETAIL_TITLE")} />;
  return <OrderDetailView order={order.data} />;
}

function OrderDetailView({ order }: { order: OrderDetail }) {
  const { t, i18n } = useTranslation("order");
  const lang = i18n.language;
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  usePublishPageDoc({ docType: "order", docId: order.id, docNo: order.poNo });
  const recheck = useRecheckOrderMutation();
  const lookups = useLookups();
  const transport =
    dictionaryOptions(lookups.data, "transportMode", lang).find((o) => o.value === order.transportMode)?.label ??
    order.transportMode;
  const canConfirm = useHasPermission("order.order.confirm");
  const canEdit = useHasPermission("order.order.edit");
  const canAdvance = useHasPermission("order.order.advance");
  const { group, leaf } = leafByPermission("order.order.view");
  const status = (code: string) => pickLabel(statusLabel("order", code), lang);
  const pairs = formatNumber(order.totalPairs, 0, lang);
  const delay = order.delayDays;
  const delayText =
    delay === null
      ? "—"
      : delay === 0
        ? t("DELAY_FLAT")
        : delay > 0
          ? t("DELAY_LATE", { days: delay })
          : t("DELAY_EARLY", { days: -delay });
  const rules = ruleSummary(order.ruleCheck);
  const open = (kind: DialogKind) => () => setDialog(kind);
  const close = (value: boolean) => {
    if (!value) setDialog(null);
  };

  const fields: FieldItem[] = [
    { label: t("F_PO"), value: <span className="tabular font-medium">{order.poNo}</span> },
    { label: t("F_REVISION"), value: t("REV", { n: order.revision }) },
    { label: t("F_REVISION_DATE"), value: order.revisionDate ?? t("NOT_REVISED") },
    { label: t("F_CUSTOMER"), value: order.customerName },
    { label: t("F_CHANNEL"), value: order.channel },
    { label: t("F_PO_TYPE"), value: order.poType },
    { label: t("F_PRODUCT_LINE"), value: order.productLine },
    { label: t("F_SEASON"), value: order.seasonCode },
    { label: t("F_STYLES"), value: order.styleNos.map((s) => `#${s}`).join("、") },
    { label: t("F_STYLE_TYPE"), value: order.styleType },
    { label: t("F_TRADE_TERM"), value: order.tradeTerm },
    { label: t("F_PAYMENT"), value: order.paymentTerms },
    { label: t("F_CURRENCY"), value: order.currency },
    { label: t("F_FOB"), value: <Money amount={order.fobAmount} currency={order.currency} /> },
    { label: t("F_BUYER"), value: order.buyerEntity },
    { label: t("F_ORIGIN"), value: order.origin },
    { label: t("F_ORDER_DATE"), value: order.orderDate },
    { label: t("F_DUE"), value: order.customerDueDate },
    { label: t("F_REPLY"), value: order.factoryReplyDate },
    {
      label: t("F_DELAY"),
      value: <span className={cn(delay !== null && delay > 0 && "text-danger")}>{delayText}</span>,
    },
    { label: t("F_FACTORY"), value: order.factoryName },
    { label: t("F_FACTORY_ENTITY"), value: order.factoryEntity },
    { label: t("F_TRANSPORT"), value: transport },
    { label: t("F_DESTINATION"), value: order.destination },
    { label: t("F_UNITS"), value: order.totalUnits === null ? null : formatNumber(order.totalUnits, 0, lang) },
    { label: t("F_PAIRS"), value: pairs },
    { label: t("F_MERCH"), value: order.merchandiserName },
    { label: t("F_OWNER"), value: order.ownerName },
    { label: t("F_CREATED"), value: formatDate(order.createdAt, true) },
    { label: t("F_STATUS"), value: <StatusBadge code={order.status} machine="order" /> },
    {
      label: t("F_CUSTOMER_CONFIRM"),
      value: order.customerConfirmedAt
        ? t("CONFIRMED_BY", {
            method: t(`METHOD_${order.customerConfirmMethod ?? "EMAIL"}` as "METHOD_EMAIL"),
            date: formatDate(order.customerConfirmedAt),
          })
        : null,
    },
    { label: t("F_NOTE"), value: order.note },
    ...(order.overrideReason ? [{ label: t("F_OVERRIDE"), value: order.overrideReason, span: 2 as const }] : []),
    ...(order.cancelReason ? [{ label: t("F_CANCEL_REASON"), value: order.cancelReason, span: 2 as const }] : []),
    { label: t("F_TERMS"), value: order.poTerms, span: "full" },
  ];

  const subtitle = [
    order.buyerEntity ? t("SUB_BUYER", { name: order.buyerEntity }) : null,
    order.factoryEntity ?? order.factoryName,
    t("SUB_DUE", { date: order.customerDueDate }),
    order.factoryReplyDate ? t("SUB_REPLY", { date: order.factoryReplyDate }) : null,
  ]
    .filter(Boolean)
    .join(" ｜ ");

  const primary =
    order.status === "PENDING_CONFIRM" && (canConfirm || canEdit) ? (
      <Button onClick={open("confirm")}>
        {t("BTN_ADVANCE", { status: status("TO_SCHEDULE") })}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    ) : order.nextStatus && order.status !== "PENDING_CONFIRM" && canAdvance ? (
      <Button onClick={open("advance")}>
        {t("BTN_ADVANCE", { status: status(order.nextStatus) })}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Button>
    ) : null;

  const dueHint =
    order.dueDaysLeft >= 0
      ? t("DUE_LEFT", { date: order.customerDueDate, days: order.dueDaysLeft })
      : t("DUE_OVER", { date: order.customerDueDate, days: -order.dueDaysLeft });

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to={`/orders/monitor?poNo=${encodeURIComponent(order.poNo)}`}>
              <Radar aria-hidden="true" className="size-4" />
              {t("BTN_MONITOR")}
            </Link>
          </Button>
        }
        crumbs={[
          { label: pickLabel(group.label, lang) },
          { label: pickLabel(leaf.label, lang), to: "/orders" },
          { label: order.poNo },
        ]}
        title={t("DETAIL_TITLE")}
      />
      <DetailHeaderCard
        actions={
          OPEN.has(order.status) ? (
            <>
              {canEdit ? (
                <>
                  <Button variant="outline" onClick={open("edit")}>
                    {t("BTN_EDIT")}
                  </Button>
                  {order.status !== "PENDING_CONFIRM" ? (
                    <Button variant="outline" onClick={open("revise")}>
                      {t("BTN_REVISE")}
                    </Button>
                  ) : null}
                </>
              ) : null}
              <RequirePermission code="order.order.factoryReply">
                <Button variant="outline" onClick={open("reply")}>
                  {t("BTN_FACTORY_REPLY")}
                </Button>
              </RequirePermission>
              {canEdit || canConfirm ? (
                <Button variant="outline" onClick={open("customer")}>
                  {t("BTN_CUSTOMER_CONFIRM")}
                </Button>
              ) : null}
              {PRODUCING.has(order.status) && (canAdvance || canEdit) ? (
                <Button variant="outline" onClick={open("production")}>
                  {t("BTN_PRODUCTION")}
                </Button>
              ) : null}
              {order.status !== "TO_SHIP" ? (
                <RequirePermission code="order.order.cancel">
                  <Button variant="outline" onClick={open("cancel")}>
                    {t("BTN_CANCEL")}
                  </Button>
                </RequirePermission>
              ) : null}
              {primary}
            </>
          ) : null
        }
        fields={fields}
        subtitle={subtitle}
        tags={
          <>
            <ToneBadge label={order.customerName} tone="info" />
            <StatusBadge code={order.status} machine="order" />
            {order.seasonCode ? <ToneBadge label={order.seasonCode} /> : null}
            {order.styleType ? <ToneBadge label={order.styleType} tone="warning" /> : null}
            {order.revision > 1 ? <PrimaryTag>{t("REV", { n: order.revision })}</PrimaryTag> : null}
          </>
        }
        title={
          <>
            {order.poNo} · {order.customerName} <span className="tabular">{t("PAIRS", { pairs })}</span>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          extra={
            <span className="text-xs">
              {dueHint} · {t("PROGRESS_SUB", { index: order.stageIndex, count: order.stageLogCount })}
            </span>
          }
          title={t("PROGRESS_TITLE")}
        >
          {order.status === "CANCELLED" && order.cancelledAt ? (
            <p className="mb-3 text-sm text-danger">{t("STAGE_CANCELLED", { date: formatDate(order.cancelledAt) })}</p>
          ) : null}
          <OrderStageTimeline order={order} />
        </SectionCard>
        <SectionCard
          extra={
            order.status === "PENDING_CONFIRM" && (canEdit || canConfirm) ? (
              <Button
                disabled={recheck.isPending}
                size="sm"
                variant="outline"
                onClick={() => recheck.mutate({ id: order.id })}
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                {t("BTN_RECHECK")}
              </Button>
            ) : null
          }
          title={t("RULE_TITLE")}
        >
          {order.ruleCheck?.length ? (
            <p className={cn("mb-3 text-sm font-medium", rules.passed ? "text-success" : "text-danger")}>
              {rules.passed ? t("RULE_ALL_PASS") : t("RULE_FAILED", { count: rules.failed })}
            </p>
          ) : null}
          <RuleCheckList items={order.ruleCheck} />
        </SectionCard>
      </div>

      <SectionCard bodyClassName="p-0" title={t("LINES_TITLE")}>
        {order.unmatchedLines.length ? (
          <div className="flex items-start gap-2 border-b border-border bg-warning/8 px-5 py-3 text-sm">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">{t("UNMATCHED_TITLE", { count: order.unmatchedLines.length })}</p>
              <p className="text-xs text-muted-foreground">
                {order.unmatchedLines
                  .map((l) => `#${l.styleNo} ${l.color ?? ""} ${l.size ?? ""} × ${l.quantity}`)
                  .join("；")}{" "}
                · {t("UNMATCHED_HINT")}
              </p>
            </div>
          </div>
        ) : null}
        <SimpleTable
          empty={t("EMPTY_LINES")}
          head={[
            t("L_STYLE"),
            t("L_NAME"),
            t("L_COLOR"),
            t("L_SIZE"),
            t("L_SKU"),
            t("L_QTY"),
            t("L_PRICE"),
            t("L_AMOUNT"),
          ]}
          rows={order.lines.map((l) => [
            <span className="tabular font-medium" key="s">
              #{l.styleNo}
            </span>,
            l.styleName ?? "—",
            l.color ?? "—",
            l.size ?? "—",
            <span className="tabular" key="sku">
              {l.sku ?? "—"}
            </span>,
            <span className="tabular" key="q">
              {formatNumber(l.quantity, 0, lang)}
            </span>,
            <span className="tabular" key="p">
              {l.unitPrice === null ? "—" : formatNumber(l.unitPrice, 3, lang)}
            </span>,
            <Money amount={l.amount} currency={order.currency} key="a" />,
          ])}
        />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard bodyClassName="p-0" title={t("REPLIES_TITLE")}>
          <SimpleTable
            empty={t("EMPTY_REPLIES")}
            head={[t("R_VERSION"), t("R_DATE"), t("R_DELAY"), t("R_BY"), t("R_AT"), t("R_NOTE")]}
            rows={order.factoryReplies.map((r) => [
              `V${r.versionNo}`,
              <span className="tabular" key="d">
                {r.replyDate}
              </span>,
              <span className={cn(r.delayDays > 0 && "text-danger")} key="delay">
                {r.delayDays === 0
                  ? t("DELAY_FLAT")
                  : r.delayDays > 0
                    ? t("DELAY_LATE", { days: r.delayDays })
                    : t("DELAY_EARLY", { days: -r.delayDays })}
              </span>,
              r.createdByName ?? "—",
              formatDate(r.createdAt, true),
              r.note ?? "—",
            ])}
          />
        </SectionCard>
        <SectionCard bodyClassName="p-0" title={t("REVISIONS_TITLE")}>
          <SimpleTable
            empty={t("EMPTY_REVISIONS")}
            head={[t("RV_REVISION"), t("RV_DUE"), t("RV_PAIRS"), t("RV_LINES"), t("RV_NOTE"), t("RV_BY"), t("RV_AT")]}
            rows={order.revisions.map((r) => {
              const snap = r.snapshot as { customerDueDate?: string; totalPairs?: number; lines?: unknown[] };
              return [
                t("REV", { n: r.revision }),
                snap.customerDueDate ?? "—",
                snap.totalPairs === undefined ? "—" : formatNumber(snap.totalPairs, 0, lang),
                snap.lines?.length ?? "—",
                r.note ?? "—",
                r.createdByName ?? "—",
                formatDate(r.createdAt, true),
              ];
            })}
          />
        </SectionCard>
      </div>

      <SectionCard bodyClassName="p-0" title={t("PRODUCTION_TITLE")}>
        <SimpleTable
          empty={t("EMPTY_PRODUCTION")}
          head={[t("P_DATE"), t("P_KNITTED"), t("P_PACKED"), t("P_RATE"), t("P_NOTE")]}
          rows={order.production.map((p) => [
            p.reportDate,
            formatNumber(p.knittedPairs, 0, lang),
            formatNumber(p.packedPairs, 0, lang),
            formatPercent(p.completionRate),
            p.note ?? "—",
          ])}
        />
      </SectionCard>

      <ConfirmOrderDialog canOverride={canConfirm} open={dialog === "confirm"} order={order} onOpenChange={close} />
      <AdvanceOrderDialog open={dialog === "advance"} order={order} onOpenChange={close} />
      <FactoryReplyDialog open={dialog === "reply"} order={order} onOpenChange={close} />
      <CustomerConfirmDialog open={dialog === "customer"} order={order} onOpenChange={close} />
      <CancelOrderDialog open={dialog === "cancel"} order={order} onOpenChange={close} />
      <ProductionDialog open={dialog === "production"} order={order} onOpenChange={close} />
      <EditOrderDialog open={dialog === "edit"} order={order} onOpenChange={close} />
      <ReviseOrderDialog open={dialog === "revise"} order={order} onOpenChange={close} />
    </section>
  );
}
