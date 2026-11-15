export const testingKeys = {
  all: () => ["testing"] as const,
  lists: () => [...testingKeys.all(), "list"] as const,
  list: (params: Record<string, string | number | undefined>) => [...testingKeys.lists(), params] as const,
  detail: (id: string) => [...testingKeys.all(), "detail", id] as const,
  reportsAll: () => [...testingKeys.all(), "reports"] as const,
  reports: (params: Record<string, string | number | undefined>) => [...testingKeys.reportsAll(), params] as const,
  reuse: (styleId: string, items: string[]) => [...testingKeys.all(), "reuse", styleId, items] as const,
};
