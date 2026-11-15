import { ArrowRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ToneBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Input } from "@/components/ui/input";
import { useFlowCardsQuery } from "@/features/flow/flow.queries";
import { useTableQueryState } from "@/lib/hooks/use-table-query-state";

import type { FlowCardDto } from "@/features/flow/flow.types";

function FlowStatusTag({ card }: { card: FlowCardDto }) {
  const { t } = useTranslation("flow");
  if (card.flowStatus === "NONE") return <ToneBadge label={t("FLOW_NONE")} />;
  if (card.flowStatus === "DRAFT")
    return (
      <ToneBadge
        label={card.currentVersionNo ? t("FLOW_DRAFT_CHANGES", { no: card.currentVersionNo }) : t("FLOW_DRAFT")}
        tone="warning"
      />
    );
  return <ToneBadge label={t("FLOW_PUBLISHED", { no: card.currentVersionNo })} tone="info" />;
}

export function FlowCustomersPage() {
  const { t } = useTranslation("flow");
  const query = useTableQueryState({ pageSize: 200 });
  const cards = useFlowCardsQuery(query.params);
  const list = cards.data?.items ?? [];

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <form
            className="relative"
            key={query.keyword ?? ""}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("keyword");
              query.setKeyword(typeof value === "string" ? value : undefined);
            }}
          >
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label={t("CUSTOMER_SEARCH")}
              className="h-9 w-64 pl-8"
              defaultValue={query.keyword ?? ""}
              name="keyword"
              placeholder={t("CUSTOMER_SEARCH")}
            />
          </form>
        }
        title={t("FLOWS_TITLE")}
      />
      {cards.isLoading ? (
        <LoadingState />
      ) : cards.error ? (
        <ErrorState error={cards.error} />
      ) : list.length === 0 ? (
        <EmptyState title={t("NO_CUSTOMERS")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.customerId}>
              <Link
                aria-label={c.name}
                className="group flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2"
                to={`/flow/customers/${c.customerId}`}
              >
                <div className="flex h-20 items-center justify-center bg-primary-soft px-4 text-center text-lg font-bold tracking-wide text-primary">
                  {c.logoText ?? c.code}
                </div>
                <div className="flex-1 space-y-1.5 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{c.name}</span>
                    <ToneBadge
                      label={c.customerStatus === "ACTIVE" ? t("ACTIVE") : t("DISABLED")}
                      tone={c.customerStatus === "ACTIVE" ? "success" : "neutral"}
                    />
                    <FlowStatusTag card={c} />
                  </div>
                  <p className="text-muted-foreground">
                    {c.code} · {c.contactName ?? "—"} · {t("TERMS", { days: c.paymentTermsDays })}
                  </p>
                  <p>
                    <span className="tabular font-semibold">{c.moduleCount}</span> {t("MODULES_UNIT")} ·{" "}
                    <span className="tabular font-semibold">{c.itemCount}</span> {t("ITEMS_UNIT_LONG")}
                  </p>
                </div>
                <div className="flex justify-end border-t border-border px-4 py-2.5 text-sm text-primary">
                  <span className="inline-flex items-center gap-1 group-hover:underline">
                    {t("CONFIGURE")} <ArrowRight aria-hidden="true" className="size-3.5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
