import { useTranslation } from "react-i18next";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { DefinitionsTable } from "@/features/metrics/components/definitions-table";
import { useMetricDefinitionsQuery } from "@/features/metrics/metrics.queries";

export function MetricDefinitionsPage() {
  const { t } = useTranslation("metrics");
  const defs = useMetricDefinitionsQuery();
  return (
    <section className="space-y-5">
      <PageHeader description={t("DEFINITIONS_DESC")} title={t("DEFINITIONS_TITLE")} />
      {defs.isLoading ? (
        <LoadingState />
      ) : defs.error ? (
        <ErrorState error={defs.error} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-xs">
          <DefinitionsTable definitions={defs.data ?? []} />
        </div>
      )}
    </section>
  );
}
