export const capacityKeys = {
  all: () => ["capacity"] as const,
  versions: () => [...capacityKeys.all(), "versions"] as const,
  detailAll: () => [...capacityKeys.all(), "detail"] as const,
  detail: (id: string, keyword: string) => [...capacityKeys.detailAll(), id, keyword] as const,
  compare: (from: string, to: string) => [...capacityKeys.all(), "compare", from, to] as const,
  tasks: () => [...capacityKeys.all(), "tasks"] as const,
  machines: () => [...capacityKeys.all(), "machines"] as const,
};
