type Params = Record<string, string | number | boolean | undefined>;

export const syncKeys = {
  all: () => ["sync"] as const,
  endpointsAll: () => [...syncKeys.all(), "endpoints"] as const,
  endpoints: (params: Params) => [...syncKeys.endpointsAll(), params] as const,
  mappingsAll: () => [...syncKeys.all(), "mappings"] as const,
  mappings: (params: Params) => [...syncKeys.mappingsAll(), "list", params] as const,
  mapping: (id: string) => [...syncKeys.mappingsAll(), "detail", id] as const,
  tasksAll: () => [...syncKeys.all(), "tasks"] as const,
  tasks: (params: Params) => [...syncKeys.tasksAll(), "list", params] as const,
  task: (id: string) => [...syncKeys.tasksAll(), "detail", id] as const,
  taskLogs: (id: string, params: Params) => [...syncKeys.tasksAll(), "logs", id, params] as const,
  retryAll: () => [...syncKeys.all(), "retry-queue"] as const,
  retryQueue: (params: Params) => [...syncKeys.retryAll(), params] as const,
};
