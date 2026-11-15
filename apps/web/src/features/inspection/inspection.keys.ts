type Params = Record<string, string | number | boolean | undefined>;

export const inspectionKeys = {
  all: () => ["inspection"] as const,
  list: (params: Params) => [...inspectionKeys.all(), "list", params] as const,
  kpis: () => [...inspectionKeys.all(), "kpis"] as const,
  detail: (id: string) => [...inspectionKeys.all(), "detail", id] as const,
  releaseCheck: (id: string) => [...inspectionKeys.all(), "release-check", id] as const,
  schedule: (params: Params) => [...inspectionKeys.all(), "schedule", params] as const,
  orderOptions: (keyword: string) => [...inspectionKeys.all(), "order-options", keyword] as const,
  orderDetail: (id: string) => [...inspectionKeys.all(), "order-detail", id] as const,
};
