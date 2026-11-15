export const orderKeys = {
  all: () => ["order"] as const,
  lists: () => [...orderKeys.all(), "list"] as const,
  list: (params: Record<string, string | number | boolean | undefined>) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all(), "detail"] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};
