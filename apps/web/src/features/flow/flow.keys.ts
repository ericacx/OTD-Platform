type Params = Record<string, string | number | undefined>;

export const flowKeys = {
  all: () => ["flow"] as const,
  modulesAll: () => [...flowKeys.all(), "modules"] as const,
  modules: (params: Params) => [...flowKeys.modulesAll(), "list", params] as const,
  module: (id: string) => [...flowKeys.modulesAll(), "detail", id] as const,
  customersAll: () => [...flowKeys.all(), "customers"] as const,
  customers: (params: Params) => [...flowKeys.customersAll(), "list", params] as const,
  customer: (customerId: string) => [...flowKeys.customersAll(), "detail", customerId] as const,
  versions: (customerId: string) => [...flowKeys.customersAll(), "versions", customerId] as const,
  diff: (customerId: string, from: string, to: string) =>
    [...flowKeys.customersAll(), "diff", customerId, from, to] as const,
  migration: (customerId: string) => [...flowKeys.customersAll(), "migration", customerId] as const,
  rulePacksAll: () => [...flowKeys.all(), "rulePacks"] as const,
  rulePacks: (params: Params) => [...flowKeys.rulePacksAll(), "list", params] as const,
  rulePackSnapshots: (id: string) => [...flowKeys.rulePacksAll(), "snapshots", id] as const,
};
