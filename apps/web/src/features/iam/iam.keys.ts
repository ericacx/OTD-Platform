export const iamKeys = {
  all: () => ["iam"] as const,
  roles: () => [...iamKeys.all(), "roles"] as const,
  role: (id: string) => [...iamKeys.roles(), id] as const,
  orgs: () => [...iamKeys.all(), "orgs"] as const,
  users: (params: Record<string, string | number | boolean | undefined>) =>
    [...iamKeys.all(), "users", params] as const,
  usersAll: () => [...iamKeys.all(), "users"] as const,
  auditLogs: (params: Record<string, string | number | undefined>) => [...iamKeys.all(), "audit-logs", params] as const,
  snapshots: (objectType: string, objectId: string) => [...iamKeys.all(), "snapshots", objectType, objectId] as const,
  params: () => [...iamKeys.all(), "params"] as const,
};
