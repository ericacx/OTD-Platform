import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

import type { TodoOverview } from "../todo.types";

export function FocusList({ focus }: { focus: TodoOverview["focus"] }) {
  const { t } = useTranslation("todo");
  const rows = [
    { key: "pending", label: t("FOCUS_PENDING"), item: focus.pendingConfirmOrders, tone: "danger" },
    { key: "booking", label: t("FOCUS_BOOKING"), item: focus.pendingBookings, tone: "danger" },
    { key: "toShip", label: t("FOCUS_TO_SHIP"), item: focus.toShipOrders, tone: "success" },
    { key: "risk", label: t("FOCUS_RISK"), item: focus.riskOrders, tone: "warning" },
  ] as const;
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/50"
            to={row.item.link}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  row.tone === "danger" ? "bg-danger" : row.tone === "warning" ? "bg-warning" : "bg-success",
                )}
              />
              {row.label}
            </span>
            <span
              className={cn(
                "tabular text-base font-semibold",
                row.item.count > 0 && row.tone === "danger" && "text-danger",
                row.item.count > 0 && row.tone === "warning" && "text-warning",
              )}
            >
              {row.item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DueReminderList({ items }: { items: TodoOverview["dueReminders"] }) {
  const { t } = useTranslation("todo");
  if (!items.length) return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{t("NO_REMINDERS")}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={`${item.kind}-${item.docId}`}>
          <Link className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/50" to={item.link}>
            <span className="min-w-0">
              <span className="block truncate">{t(`KIND_${item.kind}`, { no: item.docNo })}</span>
              {item.customerName ? (
                <span className="block text-xs text-muted-foreground">
                  {item.customerName} · {item.date}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold whitespace-nowrap",
                item.daysLeft < 0 ? "text-danger" : item.daysLeft <= 7 ? "text-warning" : "text-muted-foreground",
              )}
            >
              {item.daysLeft < 0
                ? t("DAYS_OVER", { days: -item.daysLeft })
                : item.daysLeft === 0
                  ? t("DAYS_TODAY")
                  : t("DAYS_LEFT", { days: item.daysLeft })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
