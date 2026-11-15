import { CalendarClock, ClipboardList, Layers, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth, useHasPermission } from "@/app/providers/auth-provider";
import { SectionCard } from "@/components/biz/detail-header-card";
import { KpiCard } from "@/components/biz/kpi-card";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { DueReminderList, FocusList } from "@/features/todo/components/focus-panels";
import { CustomerOrdersChart, OrderStatusDonut } from "@/features/todo/components/overview-charts";
import { TodoGroups } from "@/features/todo/components/todo-groups";
import { useTodoBoardQuery, useTodoOverviewQuery } from "@/features/todo/todo.queries";
import { formatDate } from "@/lib/date";

import type { TodoOverview } from "@/features/todo/todo.types";

function greetingKey(hour: number): "GREET_MORNING" | "GREET_AFTERNOON" | "GREET_EVENING" {
  if (hour < 12) return "GREET_MORNING";
  if (hour < 18) return "GREET_AFTERNOON";
  return "GREET_EVENING";
}

const WEEKDAYS = ["WEEKDAY_0", "WEEKDAY_1", "WEEKDAY_2", "WEEKDAY_3", "WEEKDAY_4", "WEEKDAY_5", "WEEKDAY_6"] as const;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function TodoPage() {
  const { t } = useTranslation("todo");
  const overview = useTodoOverviewQuery();
  const board = useTodoBoardQuery();
  if (overview.isLoading) return <LoadingState />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} title={t("TODOS_TITLE")} />;
  return (
    <TodoDashboard boardError={board.error} boardLoading={board.isLoading} data={overview.data} board={board.data} />
  );
}

type DashboardProps = {
  data: TodoOverview;
  board: ReturnType<typeof useTodoBoardQuery>["data"];
  boardLoading: boolean;
  boardError: Error | null;
};

function TodoDashboard({ data, board, boardLoading, boardError }: DashboardProps) {
  const { t } = useTranslation("todo");
  const { user } = useAuth();
  const canOrders = useHasPermission("order.order.view");
  const canSamples = useHasPermission("sample.sample.view");
  const { greeting, kpis, focus } = data;
  const scope = `${t(`SCOPE_${greeting.dataScope}`)} · ${greeting.allCustomers ? t("SCOPE_ALL_CUSTOMERS") : t("SCOPE_SOME_CUSTOMERS")}`;
  const byType = Object.entries(kpis.todos.byDocType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${t(`DOC_${type}` as "DOC_other", { defaultValue: t("DOC_other") })} ${count}`)
    .join(" · ");
  const now = new Date();
  const today = formatDate(now);

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-card px-6 py-6 shadow-xs">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary-soft to-transparent"
        />
        <div className="relative">
          <h1 className="text-2xl font-semibold">{t(greetingKey(now.getHours()), { name: greeting.userName })}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {today} {t(WEEKDAYS[now.getDay()] ?? "WEEKDAY_0")}
            {user?.roleNames.length ? ` · ${user.roleNames.join(" / ")}` : ""} · {t("GREET_SCOPE", { scope })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          hint={byType || t("KPI_TODOS_EMPTY")}
          icon={ListChecks}
          label={t("KPI_TODOS")}
          unit={t("UNIT_ITEMS")}
          value={kpis.todos.total}
        />
        <KpiCard
          hint={t("KPI_ORDERS_HINT", { pending: focus.pendingConfirmOrders.count, toShip: focus.toShipOrders.count })}
          icon={ClipboardList}
          label={t("KPI_ORDERS")}
          unit={t("UNIT_ORDERS")}
          value={kpis.activeOrders}
          {...(canOrders ? { to: "/orders?status=PENDING_CONFIRM,TO_SCHEDULE,IN_PRODUCTION,TO_SHIP" } : {})}
        />
        <KpiCard
          hint={t("KPI_SAMPLING_HINT")}
          icon={Layers}
          label={t("KPI_SAMPLING")}
          unit={t("UNIT_STYLES")}
          value={kpis.samplingStyles}
          {...(canSamples ? { to: "/samples" } : {})}
        />
        <KpiCard
          hint={t("KPI_DUE_HINT")}
          icon={CalendarClock}
          label={t("KPI_DUE")}
          tone="primary"
          unit={t("UNIT_LOTS")}
          value={kpis.dueSoonOrders}
          {...(canOrders
            ? {
                to: `/orders?status=PENDING_CONFIRM,TO_SCHEDULE,IN_PRODUCTION,TO_SHIP&dueTo=${addDays(today, 30)}`,
              }
            : {})}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard extra={t("CHART_CUSTOMERS_UNIT")} title={t("CHART_CUSTOMERS")}>
              <CustomerOrdersChart data={data.customerDistribution} />
            </SectionCard>
            <SectionCard title={t("CHART_STATUS")}>
              <OrderStatusDonut data={data.statusDistribution} />
            </SectionCard>
          </div>
          <SectionCard bodyClassName="p-0" title={t("TODOS_TITLE")}>
            {boardLoading ? (
              <LoadingState />
            ) : boardError ? (
              <ErrorState error={boardError} title={t("TODOS_TITLE")} />
            ) : board ? (
              <TodoGroups board={board} />
            ) : null}
          </SectionCard>
        </div>
        <div className="space-y-5">
          <SectionCard bodyClassName="p-0" title={t("FOCUS_TITLE")}>
            <FocusList focus={focus} />
          </SectionCard>
          <SectionCard bodyClassName="p-0" title={t("DUE_TITLE")}>
            <DueReminderList items={data.dueReminders} />
          </SectionCard>
        </div>
      </div>
    </section>
  );
}
