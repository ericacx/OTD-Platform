import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { notificationKeys } from "./notification.keys";

import type { NotificationDto } from "@otd/contracts/todo";

export type NotificationList = { items: NotificationDto[]; unread: number };

export function useNotificationsQuery(enabled = true) {
  return useApiQuery<NotificationList>({
    queryKey: notificationKeys.list(),
    queryFn: () => api.get<NotificationList>("/notifications"),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
