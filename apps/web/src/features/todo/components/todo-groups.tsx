import { ClipboardCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { DueLabel } from "@/components/biz/due-label";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { dueState } from "@/lib/date";
import { cn } from "@/lib/utils";

import { useCompleteTodoMutation } from "../todo.mutations";

import type { TodoBoard, TodoItem } from "../todo.types";

const LATER_LIMIT = 6;

function TodoRow({ item, tone }: { item: TodoItem; tone: "danger" | "warning" | "neutral" }) {
  const { t } = useTranslation("todo");
  const complete = useCompleteTodoMutation();
  const detail = [item.customerName, item.description].filter(Boolean).join(" · ");
  return (
    <li
      className={cn(
        "relative flex items-start justify-between gap-3 py-3 pr-1 pl-4",
        "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-r",
        tone === "danger" ? "before:bg-danger" : tone === "warning" ? "before:bg-warning" : "before:bg-border",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {item.title}
          {item.docNo && !item.title.includes(item.docNo) ? (
            <span className="tabular ml-2 text-xs font-normal text-muted-foreground">{item.docNo}</span>
          ) : null}
        </p>
        {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.dueAt ? (
          <DueLabel due={item.dueAt} />
        ) : (
          <span className="text-xs text-muted-foreground">{t("NO_DUE")}</span>
        )}
        {item.source === "MANUAL" ? (
          <Button
            className="h-auto px-1"
            disabled={complete.isPending}
            variant="link"
            onClick={() => complete.mutate(item.id)}
          >
            {t("DONE")}
          </Button>
        ) : null}
        {item.link ? (
          <Link className="text-sm font-medium text-primary hover:underline" to={item.link}>
            {t("GO")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function Group({ label, dot, children }: { label: string; dot: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 pt-3 first:border-t-0">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
        {label}
      </h4>
      <ul className="divide-y divide-border/60">{children}</ul>
    </section>
  );
}

export function groupByLocalDay(
  board: TodoBoard,
  now: Date = new Date(),
): { overdue: TodoItem[]; today: TodoItem[]; later: TodoItem[] } {
  const all = [...board.overdue, ...board.today, ...board.later];
  const out = { overdue: [] as TodoItem[], today: [] as TodoItem[], later: [] as TodoItem[] };
  for (const item of all) {
    const kind = item.dueAt ? dueState(item.dueAt, now).kind : "remaining";
    if (kind === "overdue") out.overdue.push(item);
    else if (kind === "today") out.today.push(item);
    else out.later.push(item);
  }
  const byDue = (a: TodoItem, b: TodoItem) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  out.overdue.sort(byDue);
  out.today.sort(byDue);
  out.later.sort(byDue);
  return out;
}

export function TodoGroups({ board }: { board: TodoBoard }) {
  const { t } = useTranslation("todo");
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => groupByLocalDay(board), [board]);
  if (!board.counts.total) return <EmptyState className="m-5" icon={ClipboardCheck} title={t("NO_TODOS")} />;
  const later = expanded ? groups.later : groups.later.slice(0, LATER_LIMIT);
  return (
    <div className="pb-2">
      {groups.overdue.length ? (
        <Group dot="bg-danger" label={`${t("GROUP_OVERDUE")} ${groups.overdue.length}`}>
          {groups.overdue.map((item) => (
            <TodoRow item={item} key={item.id} tone="danger" />
          ))}
        </Group>
      ) : null}
      {groups.today.length ? (
        <Group dot="bg-warning" label={`${t("GROUP_TODAY")} ${groups.today.length}`}>
          {groups.today.map((item) => (
            <TodoRow item={item} key={item.id} tone="warning" />
          ))}
        </Group>
      ) : null}
      {groups.later.length ? (
        <Group
          dot="bg-subtle-foreground"
          label={`${t("GROUP_LATER")} · ${t("SHOWING", { shown: later.length, total: groups.later.length })}`}
        >
          {later.map((item) => (
            <TodoRow item={item} key={item.id} tone="neutral" />
          ))}
        </Group>
      ) : null}
      {groups.later.length > LATER_LIMIT ? (
        <div className="px-5 pt-1">
          <Button className="h-auto px-0" variant="link" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t("COLLAPSE") : t("SHOW_ALL")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
