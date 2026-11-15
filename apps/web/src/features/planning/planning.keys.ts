export const planningKeys = {
  all: () => ["planning"] as const,
  lists: () => [...planningKeys.all(), "list"] as const,
  list: (archived: boolean, params: Record<string, string | number | undefined>) =>
    [...planningKeys.lists(), archived ? "archived" : "active", params] as const,
  detail: (id: string) => [...planningKeys.all(), "detail", id] as const,
  styles: (params: Record<string, string | undefined>) => [...planningKeys.all(), "styles", params] as const,
};
