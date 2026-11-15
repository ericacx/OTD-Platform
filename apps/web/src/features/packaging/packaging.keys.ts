type Params = Record<string, string | number | undefined>;

export const packagingKeys = {
  all: () => ["packaging"] as const,
  plansAll: () => [...packagingKeys.all(), "plans"] as const,
  plans: (params: Params) => [...packagingKeys.plansAll(), "list", params] as const,
  plan: (id: string) => [...packagingKeys.plansAll(), "detail", id] as const,
  compare: (id: string, from: number, to: number) => [...packagingKeys.plansAll(), "compare", id, from, to] as const,
  cartonsAll: () => [...packagingKeys.all(), "cartons"] as const,
  cartons: (params: Params) => [...packagingKeys.cartonsAll(), "list", params] as const,
  coverage: (orderId: string) => [...packagingKeys.cartonsAll(), "coverage", orderId] as const,
  orderOptions: () => [...packagingKeys.all(), "order-options"] as const,
};
