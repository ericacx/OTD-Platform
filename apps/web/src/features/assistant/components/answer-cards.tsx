import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { ProgressTimeline, type TimelineState, type TimelineStep } from "@/components/biz/progress-timeline";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type {
  AssistantCard,
  BarCard,
  HighlightCard,
  KpisCard,
  LineCard,
  TableCard,
  TimelineCard,
} from "../assistant.types";
import type { ReactNode } from "react";

type Tone = HighlightCard["tone"];

const HIGHLIGHT_TONE: Record<Tone, string> = {
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/10 text-danger",
};

const ROW_TONE: Record<Tone, string> = {
  info: "border-l-info",
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
};

const NODE_STATE: Record<TimelineCard["nodes"][number]["state"], TimelineState> = {
  NOT_STARTED: "pending",
  IN_PROGRESS: "current",
  DONE: "done",
  BLOCKED: "blocked",
  NOT_APPLICABLE: "na",
};

function formatValue(item: KpisCard["items"][number], locale: string): string {
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: item.format === "int" ? 0 : 2,
    minimumFractionDigits: item.format === "money" ? 2 : 0,
  }).format(item.value);
  if (item.format === "money")
    return item.currency === "USD" ? `$${number}` : `${item.currency ?? ""} ${number}`.trim();
  if (item.format === "percent") return `${number}%`;
  return number;
}

function MaybeLink({ to, className, children }: { to: string | null; className?: string; children: ReactNode }) {
  return to ? (
    <Link className={cn("block transition-colors hover:border-primary/40", className)} to={to}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function KpisView({ card }: { card: KpisCard }) {
  const { i18n } = useTranslation();
  return (
    <div className="space-y-1.5">
      {card.title ? <p className="text-xs text-muted-foreground">{card.title}</p> : null}
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {card.items.map((item) => (
          <MaybeLink className="rounded-[10px] border border-border p-2.5" key={item.label} to={item.link}>
            <span className="block text-[11px] text-muted-foreground">{item.label}</span>
            <span className="tabular flex items-baseline gap-1 text-[22px] font-semibold leading-tight">
              <span>{formatValue(item, i18n.language)}</span>
              {item.unit && item.format !== "percent" ? (
                <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
              ) : null}
            </span>
          </MaybeLink>
        ))}
      </div>
    </div>
  );
}

function HighlightView({ card }: { card: HighlightCard }) {
  return (
    <MaybeLink
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm",
        HIGHLIGHT_TONE[card.tone],
      )}
      to={card.link}
    >
      <span>{card.label}</span>
      {card.value ? <b className="text-right font-semibold">{card.value}</b> : null}
    </MaybeLink>
  );
}

function BarView({ card }: { card: BarCard }) {
  const max = Math.max(...card.items.map((i) => i.value), 0) || 1;
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs text-muted-foreground">{card.title}</figcaption>
      <ul aria-label={card.title} className="space-y-1.5">
        {card.items.map((item) => (
          <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs" key={item.label}>
            <span className="truncate" title={item.label}>
              {item.link ? (
                <Link className="hover:text-primary hover:underline" to={item.link}>
                  {item.label}
                </Link>
              ) : (
                item.label
              )}
            </span>
            <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </span>
            <span className="tabular whitespace-nowrap text-muted-foreground">{item.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function LineView({ card }: { card: LineCard }) {
  const { t } = useTranslation("assistant");
  const config: ChartConfig = { value: { label: card.unit ?? card.title, color: "var(--chart-1)" } };
  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{card.title}</span>
        <span className="tabular">{t("AVG", { value: card.average })}</span>
      </figcaption>
      <ChartContainer aria-hidden="true" className="h-[160px] w-full" config={config}>
        <LineChart data={card.points} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" fontSize={11} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} fontSize={11} tickLine={false} width={36} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ReferenceLine stroke="var(--muted-foreground)" strokeDasharray="4 4" y={card.average} />
          <Line dataKey="value" dot={{ r: 3 }} stroke="var(--color-value)" strokeWidth={2} type="linear" />
        </LineChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{card.title}</caption>
        <tbody>
          {card.points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function TableView({ card }: { card: TableCard }) {
  return (
    <div className="space-y-1.5">
      {card.title ? <p className="text-xs text-muted-foreground">{card.title}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {card.columns.map((col) => (
                <th
                  className={cn(
                    "h-8 whitespace-nowrap px-2.5 font-medium",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                  key={col.key}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row, index) => (
              <tr
                className={cn("border-t border-border", row.tone && cn("border-l-2", ROW_TONE[row.tone]))}
                key={`${index}-${String(row.cells[card.columns[0]?.key ?? ""] ?? "")}`}
              >
                {card.columns.map((col, colIndex) => {
                  const value = row.cells[col.key];
                  const text = value === null || value === undefined || value === "" ? "—" : String(value);
                  return (
                    <td
                      className={cn(
                        "px-2.5 py-2 align-top",
                        col.align === "right" ? "tabular text-right" : "text-left",
                        text.length > 16 ? "min-w-[14rem] whitespace-normal" : "whitespace-nowrap",
                      )}
                      key={col.key}
                    >
                      {colIndex === 0 && row.link ? (
                        <Link className="font-medium text-primary hover:underline" to={row.link}>
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineView({ card }: { card: TimelineCard }) {
  const { t } = useTranslation("assistant");
  const steps = card.nodes.map((node): TimelineStep => {
    const step: TimelineStep = {
      key: node.code,
      title: `${node.code} ${node.name}`,
      state: NODE_STATE[node.state],
      gate: node.gate !== null,
      description: node.summary,
    };
    if (node.blockedReasons.length) {
      step.children = (
        <ul className="space-y-0.5 text-xs text-danger">
          {node.blockedReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      );
    }
    if (node.link && node.state !== "NOT_APPLICABLE") step.link = { to: node.link };
    return step;
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {card.link ? (
          <Link className="text-sm font-semibold text-primary hover:underline" to={card.link}>
            {card.title}
          </Link>
        ) : (
          <span className="text-sm font-semibold">{card.title}</span>
        )}
        <span className="tabular text-xs text-muted-foreground">
          {t("TIMELINE_DONE", { done: card.completedCount, total: card.total })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{card.headline}</p>
      <ProgressTimeline className="max-h-[420px] overflow-y-auto pr-1" steps={steps} />
    </div>
  );
}

export function AnswerCard({ card }: { card: AssistantCard }) {
  switch (card.type) {
    case "kpis":
      return <KpisView card={card} />;
    case "highlight":
      return <HighlightView card={card} />;
    case "bar":
      return <BarView card={card} />;
    case "line":
      return <LineView card={card} />;
    case "table":
      return <TableView card={card} />;
    case "timeline":
      return <TimelineView card={card} />;
  }
}
