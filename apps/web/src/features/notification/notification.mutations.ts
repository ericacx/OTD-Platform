import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { notificationKeys } from "./notification.keys";

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, string | null>({
    mutationFn: (id) => (id ? api.post<null>(`/notifications/${id}/read`) : api.post<null>("/notifications/read-all")),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all() });
    },
  });
}
