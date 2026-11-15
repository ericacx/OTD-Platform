export type PatrolHitParams = {
  module?: string | undefined;
  light?: string | undefined;
  severity?: string | undefined;
  status?: string | undefined;
  page: number;
  pageSize: number;
};

export type PatrolRunParams = { trigger?: string | undefined; page: number; pageSize: number };

export const patrolKeys = {
  all: () => ["patrol"] as const,
  dashboardAll: () => [...patrolKeys.all(), "dashboard"] as const,
  dashboard: (params: PatrolHitParams) => [...patrolKeys.dashboardAll(), params] as const,
  rules: () => [...patrolKeys.all(), "rules"] as const,
  runsAll: () => [...patrolKeys.all(), "runs"] as const,
  runs: (params: PatrolRunParams) => [...patrolKeys.runsAll(), params] as const,
};
