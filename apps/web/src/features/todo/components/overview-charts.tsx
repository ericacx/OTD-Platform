import { pickLabel, statusLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

import type { TodoOverview } from "../todo.types";

const STATUS_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function CustomerOrdersChart({ data }: { data: TodoOverview["customerDistribution"] }) {
  const { t } = useTranslation("todo");
  if (!data.length) return <p className="py-10 text-center text-sm text-muted-foreground">{t("CHART_EMPTY")}</p>;
  const config: ChartConfig = { pairsWan: { label: t("CHART_PAIRS_LABEL"), color: "var(--chart-1)" } };
  return (
    <figure>
      <ChartContainer aria-hidden="true" className="h-[220px] w-full" config={config}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="customerName" fontSize={12} interval={0} tickLine={false} />
          <YAxis allowDecimals axisLine={false} fontSize={12} tickLine={false} width={44} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="pairsWan" fill="var(--color-pairsWan)" maxBarSize={36} radius={[4, 4, 0, 0]}>
            <LabelList className="fill-muted-foreground" dataKey="pairsWan" fontSize={11} position="top" />
          </Bar>
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{t("CHART_CUSTOMERS")}</caption>
        <tbody>
          {data.map((row) => (
            <tr key={row.customerId}>
              <th scope="row">{row.customerName}</th>
              <td>{t("CHART_PAIRS", { value: row.pairsWan, orders: row.orders })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function OrderStatusDonut({ data }: { data: TodoOverview["statusDistribution"] }) {
  const { t, i18n } = useTranslation("todo");
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const rows = data.map((row, index) => ({
    ...row,
    label: pickLabel(statusLabel("order", row.status), i18n.language),
    color: STATUS_COLORS[index % STATUS_COLORS.length]!,
  }));
  const config: ChartConfig = Object.fromEntries(
    rows.map((row) => [row.status, { label: row.label, color: row.color }]),
  );
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-[180px] shrink-0">
        {total ? (
          <ChartContainer aria-hidden="true" className="size-[180px]" config={config}>
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
              <Pie
                data={rows.filter((row) => row.count > 0)}
                dataKey="count"
                innerRadius={58}
                nameKey="status"
                outerRadius={82}
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {rows
                  .filter((row) => row.count > 0)
                  .map((row) => (
                    <Cell fill={row.color} key={row.status} />
                  ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <div aria-hidden="true" className="size-[180px] rounded-full border-[24px] border-muted" />
        )}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold">{total}</span>
          <span className="text-xs text-muted-foreground">{t("UNIT_ORDERS")}</span>
        </div>
      </div>
      <ul aria-label={t("CHART_STATUS")} className="w-full space-y-1.5 text-sm">
        {rows.map((row) => (
          <li className="flex items-center justify-between gap-3" key={row.status}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: row.color }} />
              {row.label}
            </span>
            <span className="tabular font-medium">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
