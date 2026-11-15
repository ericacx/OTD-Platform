type Params = Record<string, string | number | undefined>;

export const factoryauditKeys = {
  all: () => ["factoryaudit"] as const,
  plans: (params: Params) => [...factoryauditKeys.all(), "plans", params] as const,
  records: (params: Params) => [...factoryauditKeys.all(), "records", params] as const,
  findings: (params: Params) => [...factoryauditKeys.all(), "findings", params] as const,
  detail: (id: string) => [...factoryauditKeys.all(), "detail", id] as const,
};
