type Params = Record<string, string | number | boolean | undefined>;

export const shipmentKeys = {
  all: () => ["shipment"] as const,
  list: (params: Params) => [...shipmentKeys.all(), "list", params] as const,
  kpis: () => [...shipmentKeys.all(), "kpis"] as const,
  detail: (id: string) => [...shipmentKeys.all(), "detail", id] as const,
  bookings: (params: Params) => [...shipmentKeys.all(), "bookings", params] as const,
  booking: (id: string) => [...shipmentKeys.all(), "booking", id] as const,
};
