export const masterdataKeys = {
  all: () => ["masterdata"] as const,
  lookups: () => [...masterdataKeys.all(), "lookups"] as const,
  customersAll: () => [...masterdataKeys.all(), "customers"] as const,
  customers: (params: Record<string, string | number | undefined>) =>
    [...masterdataKeys.customersAll(), params] as const,
};
