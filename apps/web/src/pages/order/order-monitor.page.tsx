import { AlertCircle, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { SectionCard } from "@/components/biz/detail-header-card";
import { FieldGrid } from "@/components/biz/field-grid";
import { StatusBadge } from "@/components/biz/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MainlineHeadline, MainlineTimeline } from "@/features/mainline/components/mainline-timeline";
import { useMonitorQuery } from "@/features/mainline/mainline.queries";
import { formatNumber } from "@/lib/format";
import { BizError } from "@/lib/http/errors";
import { usePublishPageDoc } from "@/stores/page-doc.store";

import type { MonitorDto } from "@/features/mainline/mainline.types";

export function OrderMonitorPage() {
  const { t } = useTranslation("order");
  const [params, setParams] = useSearchParams();
  const poNo = params.get("poNo")?.trim() ?? "";
  const [value, setValue] = useState(poNo);
  const monitor = useMonitorQuery(poNo || undefined);

  let body;
  if (!poNo) {
    body = <EmptyState description={t("MONITOR_EMPTY_DESC")} icon={Search} title={t("MONITOR_EMPTY_TITLE")} />;
  } else if (monitor.isLoading) {
    body = <LoadingState />;
  } else if (monitor.error instanceof BizError && monitor.error.code === "COMMON_NOT_FOUND") {
    body = (
      <EmptyState
        description={t("MONITOR_NOT_FOUND_DESC")}
        icon={AlertCircle}
        title={t("MONITOR_NOT_FOUND", { po: poNo })}
      />
    );
  } else if (monitor.error || !monitor.data) {
    body = <ErrorState error={monitor.error} title={t("MONITOR_TITLE")} />;
  } else {
    body = <MonitorResult data={monitor.data} />;
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <form
            className="flex w-full gap-2 sm:w-auto"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const next = value.trim();
              setParams(next ? { poNo: next } : {}, { replace: true });
            }}
          >
            <Input
              aria-label={t("MONITOR_PH")}
              className="h-9 sm:w-72"
              placeholder={t("MONITOR_PH")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <Button type="submit">
              <Search aria-hidden="true" className="size-4" />
              {t("MONITOR_SEARCH")}
            </Button>
          </form>
        }
        title={t("MONITOR_TITLE")}
      />
      {body}
    </section>
  );
}

function MonitorResult({ data }: { data: MonitorDto }) {
  const { t, i18n } = useTranslation("order");
  const { order, mainline } = data;
  usePublishPageDoc({ docType: "order", docId: order.id, docNo: order.poNo });
  return (
    <div className="space-y-5">
      <SectionCard title={t("BASIC_INFO")}>
        <FieldGrid
          items={[
            {
              label: t("F_PO"),
              value: (
                <Link className="tabular font-semibold text-primary hover:underline" to={`/orders/${order.id}`}>
                  {order.poNo}
                </Link>
              ),
            },
            { label: t("F_CUSTOMER"), value: order.customerName },
            { label: t("F_SEASON"), value: order.seasonCode },
            {
              label: t("F_STYLES"),
              value:
                order.styleNos.length > 1
                  ? t("STYLE_MORE", {
                      first: order.styleNos[0],
                      count: order.styleNos.length,
                      rest: order.styleNos.length - 1,
                    })
                  : order.styleSummary,
            },
            { label: t("M_QTY"), value: t("PAIRS", { pairs: formatNumber(order.totalPairs, 0, i18n.language) }) },
            { label: t("M_DUE"), value: order.customerDueDate },
            { label: t("F_FACTORY"), value: order.factoryName },
            { label: t("F_STATUS"), value: <StatusBadge code={order.status} machine="order" /> },
          ]}
        />
      </SectionCard>
      <SectionCard title={t("PROCESS_TITLE")}>
        <div className="space-y-4">
          <MainlineHeadline mainline={mainline} />
          <MainlineTimeline mainline={mainline} />
        </div>
      </SectionCard>
    </div>
  );
}
