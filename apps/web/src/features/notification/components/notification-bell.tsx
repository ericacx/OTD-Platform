import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";

import { useMarkNotificationReadMutation } from "../notification.mutations";
import { useNotificationsQuery } from "../notification.queries";

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useNotificationsQuery();
  const markRead = useMarkNotificationReadMutation();
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button aria-label={t("TOP_NOTIFY")} className="relative" size="icon" variant="ghost">
          <Bell aria-hidden="true" className="size-4" />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">{t("NOTIF_TITLE")}</span>
          <Button
            disabled={unread === 0 || markRead.isPending}
            size="sm"
            variant="ghost"
            onClick={() => markRead.mutate(null)}
          >
            {t("NOTIF_READ_ALL")}
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("NOTIF_EMPTY")}</li>
          ) : (
            items.map((n) => (
              <li key={n.id}>
                <button
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                    n.readAt ? "opacity-70" : "",
                  )}
                  type="button"
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    setOpen(false);
                    if (n.link) void navigate(n.link);
                  }}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {n.readAt ? null : <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
                    {n.title}
                  </span>
                  {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDate(n.createdAt, true)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
