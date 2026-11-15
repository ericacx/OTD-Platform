type Params = Record<string, string | number | boolean | undefined>;

export const receivableKeys = {
  all: () => ["receivable"] as const,
  list: (params: Params) => [...receivableKeys.all(), "list", params] as const,
  kpis: (params: Params) => [...receivableKeys.all(), "kpis", params] as const,
  detail: (id: string) => [...receivableKeys.all(), "detail", id] as const,
  collection: (params: Params) => [...receivableKeys.all(), "collection", params] as const,
  summary: (customerId: string | undefined) => [...receivableKeys.all(), "summary", customerId ?? "all"] as const,
  invoices: (params: Params) => [...receivableKeys.all(), "invoices", params] as const,
};
