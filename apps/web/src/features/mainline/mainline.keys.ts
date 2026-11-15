export const mainlineKeys = {
  all: () => ["mainline"] as const,
  monitor: (poNo: string) => [...mainlineKeys.all(), "monitor", poNo] as const,
  order: (orderId: string) => [...mainlineKeys.all(), "order", orderId] as const,
  search: (q: string) => [...mainlineKeys.all(), "search", q] as const,
};
