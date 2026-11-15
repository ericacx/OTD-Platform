import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { todoKeys } from "./todo.keys";

import type { TodoBoard, TodoOverview } from "./todo.types";

export function useTodoOverviewQuery() {
  return useApiQuery<TodoOverview>({
    queryKey: todoKeys.overview(),
    queryFn: () => api.get<TodoOverview>("/todos/overview"),
  });
}

export function useTodoBoardQuery() {
  return useApiQuery<TodoBoard>({ queryKey: todoKeys.board(), queryFn: () => api.get<TodoBoard>("/todos/board") });
}
