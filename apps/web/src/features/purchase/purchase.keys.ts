type Params = Record<string, string | number | undefined>;

export const purchaseKeys = {
  all: () => ["purchase"] as const,
  listsAll: () => [...purchaseKeys.all(), "list"] as const,
  list: (params: Params) => [...purchaseKeys.listsAll(), params] as const,
  detail: (id: string) => [...purchaseKeys.all(), "detail", id] as const,
  receiptsAll: () => [...purchaseKeys.all(), "receipts"] as const,
  receipts: (params: Params) => [...purchaseKeys.receiptsAll(), params] as const,
  requirements: (orderId: string) => [...purchaseKeys.all(), "requirements", orderId] as const,
  materials: () => [...purchaseKeys.all(), "materials"] as const,
  orderOptions: () => [...purchaseKeys.all(), "order-options"] as const,
};
