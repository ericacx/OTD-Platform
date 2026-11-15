import { pickLabel } from "@otd/shared";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

import { formatMetric } from "./format";

import type { ChartDto } from "@otd/contracts/metrics";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const STATUS_SERIES: Record<string, string> = { red: "var(--danger)", yellow: "var(--warning)" };

type Row = Record<string, string | number | null>;
type ColoredRow = { key: string; label: string; value: number; color: string };
const TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const NO_RADIUS: [number, number, number, number] = [0, 0, 0, 0];

function useRows(chart: ChartDto): Row[] {
  const { t, i18n } = useTranslation("metrics");
  const en = i18n.language.startsWith("en");
  return chart.data.map((row) => {
    const key = String(row.key ?? "");
    const category = t(`CAT_${key}`, { defaultValue: "" });
    const label = chart.key.endsWith("ByCategory") && category ? category : en && typeof row.labelEn === "string" ? row.labelEn : String(row.label ?? key);
    return { ...row, label };
  });
}

function configOf(chart: ChartDto, lang: string): ChartConfig {
  return Object.fromEntries(chart.series.map((s, i) => [s.key, { label: pickLabel(s.label, lang), color: STATUS_SERIES[s.key] ?? PALETTE[i % PALETTE.length]! }]));
}

function SrTable({ chart, rows }: { chart: ChartDto; rows: Row[] }) {
  const { t, i18n } = useTranslation("metrics");
  return (
    <table className="sr-only">
      <caption>{t("TABLE_CAPTION", { title: pickLabel(chart.title, i18n.language) })}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row.key)}>
            <th scope="row">{String(row.label)}</th>
            {chart.series.map((s) => (
              <td key={s.key}>{`${pickLabel(s.label, i18n.language)} ${formatMetric(row[s.key] as number | null, s.unit ?? chart.unit)}`}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BoardChart({ chart }: { chart: ChartDto }) {
  const { t, i18n } = useTranslation("metrics");
  const rows = useRows(chart);
  const config = configOf(chart, i18n.language);
  const title = pickLabel(chart.title, i18n.language);
  const body = (() => {
    if (!rows.length) return <p className="py-16 text-center text-sm text-muted-foreground">{t("CHART_EMPTY")}</p>;
    if (chart.kind === "donut") return <Donut chart={chart} rows={rows} />;
    if (chart.kind === "barH") {
      return (
        <ChartContainer aria-hidden="true" className="w-full" config={config} style={{ height: Math.max(160, rows.length * 36 + 24) }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis axisLine={false} fontSize={12} tickLine={false} type="number" />
            <YAxis axisLine={false} dataKey="label" fontSize={12} tickLine={false} type="category" width={88} />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="value" fill="var(--color-value)" maxBarSize={22} radius={[0, 4, 4, 0]}>
              <LabelList className="fill-muted-foreground" dataKey="value" fontSize={11} position="right" />
            </Bar>
          </BarChart>
        </ChartContainer>
      );
    }
    if (chart.kind === "combo") return <Trend chart={chart} rows={rows} />;
    const stacked = chart.kind === "stacked";
    return (
      <ChartContainer aria-hidden="true" className="h-[240px] w-full" config={config}>
        <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" fontSize={12} interval={0} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} fontSize={12} tickLine={false} width={36} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
          <ChartLegend content={<ChartLegendContent />} />
          {chart.series.map((s, i) => (
            <Bar
              dataKey={s.key}
              fill={`var(--color-${s.key})`}
              key={s.key}
              maxBarSize={28}
              radius={stacked && i < chart.series.length - 1 ? NO_RADIUS : TOP_RADIUS}
              {...(stacked ? { stackId: "stack" } : {})}
              stroke="var(--card)"
              strokeWidth={stacked ? 2 : 0}
            />
          ))}
        </BarChart>
      </ChartContainer>
    );
  })();
  return (
    <figure className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-xs" data-testid={`chart-${chart.key}`}>
      <figcaption className="mb-3 font-medium">{title}</figcaption>
      {body}
      <SrTable chart={chart} rows={rows} />
    </figure>
  );
}

function Donut({ chart, rows }: { chart: ChartDto; rows: Row[] }) {
  const { i18n } = useTranslation("metrics");
  const total = rows.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
  const colored: ColoredRow[] = rows.map((row, i) => ({ key: String(row.key), label: String(row.label), value: Number(row.value ?? 0), color: PALETTE[i % PALETTE.length]! }));
  const config: ChartConfig = Object.fromEntries(colored.map((row) => [String(row.key), { label: String(row.label), color: row.color }]));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-[180px] shrink-0">
        <ChartContainer aria-hidden="true" className="size-[180px]" config={config}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie data={colored} dataKey="value" innerRadius={58} nameKey="key" outerRadius={82} paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
              {colored.map((row) => (
                <Cell fill={row.color} key={String(row.key)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold">{total}</span>
          <span className="text-xs text-muted-foreground">{pickLabel(chart.series[0]?.label ?? { zh: "", en: "" }, i18n.language)}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {colored.map((row) => (
          <li className="flex items-center justify-between gap-3" key={String(row.key)}>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: row.color }} />
              {String(row.label)}
            </span>
            <span className="tabular font-medium">{String(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trend({ chart, rows }: { chart: ChartDto; rows: Row[] }) {
  const { t } = useTranslation("metrics");
  const amount = chart.series[0];
  const rate = chart.series[1];
  const amountConfig: ChartConfig = amount ? { [amount.key]: { label: t("TREND_CONFIRMED"), color: "var(--chart-1)" } } : {};
  const rateConfig: ChartConfig = rate ? { [rate.key]: { label: t("TREND_ON_TIME"), color: "var(--chart-2)" } } : {};
  const rateRows = rate ? rows.filter((row) => row[rate.key] !== null && row[rate.key] !== undefined) : [];
  return (
    <div className="space-y-4">
      {amount ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("TREND_CONFIRMED")}</p>
          <ChartContainer aria-hidden="true" className="h-[150px] w-full" config={amountConfig}>
            <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
              <YAxis axisLine={false} fontSize={11} tickLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey={amount.key} fill={`var(--color-${amount.key})`} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      ) : null}
      {rate && rateRows.length ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t("TREND_ON_TIME")}</p>
          <ChartContainer aria-hidden="true" className="h-[120px] w-full" config={rateConfig}>
            <LineChart data={rateRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
              <YAxis axisLine={false} domain={[0, 100]} fontSize={11} tickLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey={rate.key} dot={{ r: 4 }} stroke={`var(--color-${rate.key})`} strokeWidth={2} type="monotone" />
            </LineChart>
          </ChartContainer>
        </div>
      ) : null}
    </div>
  );
}
