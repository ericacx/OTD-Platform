import { BOARD_TABS, BOARD_TITLES, type BoardKey, type PeriodKey } from "@otd/contracts/metrics";
import { pickLabel } from "@otd/shared";
import { BookOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { toast } from "sonner";

import { useAuth } from "@/app/providers/auth-provider";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOrgsQuery } from "@/features/iam/iam.queries";
import { useLookups } from "@/features/masterdata/lookups.queries";
import { BoardChart } from "@/features/metrics/components/board-chart";
import { BoardTable } from "@/features/metrics/components/board-table";
import { DefinitionsTable } from "@/features/metrics/components/definitions-table";
import { DiagnosisPanel } from "@/features/metrics/components/diagnosis-panel";
import { KpiGrid } from "@/features/metrics/components/kpi-grid";
import { useRefreshDiagnosisMutation } from "@/features/metrics/metrics.mutations";
import { useBoardQuery, useDiagnosisQuery, useMetricDefinitionsQuery } from "@/features/metrics/metrics.queries";
import { cn } from "@/lib/utils";

const BOARDS: BoardKey[] = ["sales", "manager", "gm"];
const PERIODS: PeriodKey[] = ["month", "quarter", "year"];
const selectClass = "h-9 rounded-md border border-input bg-card px-2 text-sm";

function OrgSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation("metrics");
  const orgs = useOrgsQuery();
  return (
    <select aria-label={t("ORG")} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("ORG_ALL")}</option>
      {(orgs.data ?? [])
        .filter((o) => o.function === "SALES" || o.function === "MANAGEMENT")
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
    </select>
  );
}

function DefinitionsSheet({ board, open, onOpenChange }: { board: BoardKey; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("metrics");
  const defs = useMetricDefinitionsQuery();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{t("DEFINITIONS_TITLE")}</SheetTitle>
          <SheetDescription>{t("DEFINITIONS_DESC")}</SheetDescription>
        </SheetHeader>
        {defs.isLoading ? <LoadingState /> : defs.error ? <ErrorState error={defs.error} /> : <DefinitionsTable board={board} definitions={defs.data ?? []} />}
      </SheetContent>
    </Sheet>
  );
}

function BoardPage({ board }: { board: BoardKey }) {
  const { t, i18n } = useTranslation("metrics");
  const lang = i18n.language;
  const { hasPermission } = useAuth();
  const tabs = BOARD_TABS[board];
  const [tab, setTab] = useState(tabs[0]!.key);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [orgId, setOrgId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [defsOpen, setDefsOpen] = useState(false);
  const lookups = useLookups();
  const filters = { period, orgId: orgId || undefined, customerId: customerId || undefined };
  const query = useBoardQuery(board, { ...filters, tab });
  const diagnosis = useDiagnosisQuery(board, filters);
  const refresh = useRefreshDiagnosisMutation(board);
  const data = query.data;
  const tabLabel = pickLabel(tabs[0]!.label, lang);

  async function regenerate() {
    try {
      await refresh.mutateAsync(filters);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("DIAG_EMPTY"));
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <>
            <select aria-label={t("PERIOD")} className={selectClass} value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`PERIOD_${p}`)}
                </option>
              ))}
            </select>
            {board !== "sales" && hasPermission("iam.org.view") ? <OrgSelect value={orgId} onChange={setOrgId} /> : null}
            <select aria-label={t("CUSTOMER")} className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("CUSTOMER_ALL")}</option>
              {(lookups.data?.customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button onClick={() => setDefsOpen(true)}>
              <BookOpen aria-hidden="true" className="size-4" />
              {t("DEFINITIONS")}
            </Button>
          </>
        }
        description={data ? pickLabel(data.scope.label, lang) : undefined}
        title={pickLabel(BOARD_TITLES[board], lang)}
      />
      <nav aria-label={t("BOARDS")} className="flex flex-wrap gap-2">
        {BOARDS.filter((b) => hasPermission(`metrics.${b}.view`)).map((b) => (
          <NavLink
            className={({ isActive }) => cn("rounded-md px-3 py-1.5 text-sm", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
            end
            key={b}
            to={`/dashboards/${b}`}
          >
            {pickLabel(BOARD_TITLES[b], lang)}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.key}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === item.key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            key={item.key}
            role="tab"
            type="button"
            onClick={() => setTab(item.key)}
          >
            {pickLabel(item.label, lang)}
          </button>
        ))}
      </div>
      <DiagnosisPanel diagnosis={diagnosis.data} loading={diagnosis.isLoading} refreshing={refresh.isPending} tabLabel={tabLabel} onRefresh={() => void regenerate()} />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : data ? (
        <>
          <KpiGrid kpis={data.kpis} />
          {data.charts.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.charts.map((chart) => (
                <BoardChart chart={chart} key={chart.key} />
              ))}
            </div>
          ) : null}
          {data.table ? <BoardTable table={data.table} /> : null}
        </>
      ) : null}
      <DefinitionsSheet board={board} open={defsOpen} onOpenChange={setDefsOpen} />
    </section>
  );
}

export function SalesBoardPage() {
  return <BoardPage board="sales" />;
}

export function ManagerBoardPage() {
  return <BoardPage board="manager" />;
}

export function GmBoardPage() {
  return <BoardPage board="gm" />;
}
