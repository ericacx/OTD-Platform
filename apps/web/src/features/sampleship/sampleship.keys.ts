type Params = Record<string, string | number | boolean | undefined>;

export const sampleshipKeys = {
  all: () => ["sampleship"] as const,
  lists: () => [...sampleshipKeys.all(), "list"] as const,
  list: (params: Params) => [...sampleshipKeys.lists(), params] as const,
  details: () => [...sampleshipKeys.all(), "detail"] as const,
  detail: (id: string) => [...sampleshipKeys.details(), id] as const,
  recipients: (customerId?: string) => [...sampleshipKeys.all(), "recipients", customerId ?? "all"] as const,
};
