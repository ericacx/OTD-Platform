import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { todoKeys } from "./todo.keys";

export function useCompleteTodoMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, string>({
    mutationFn: (id) => api.post<null>(`/todos/${id}/done`),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: todoKeys.all() });
    },
  });
}
