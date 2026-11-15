import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { iamKeys } from "./iam.keys";

import type {
  AuditLog,
  ChangeSnapshot,
  OrgNode,
  PageOf,
  RoleDetail,
  RoleSummary,
  SystemParam,
  UserSummary,
} from "./iam.types";

export function useRolesQuery(enabled = true) {
  return useApiQuery<RoleSummary[]>({
    queryKey: iamKeys.roles(),
    queryFn: () => api.get<RoleSummary[]>("/system/roles"),
    enabled,
  });
}

export function useRoleDetailQuery(id: string | null) {
  return useApiQuery<RoleDetail>({
    queryKey: iamKeys.role(id ?? "none"),
    queryFn: () => api.get<RoleDetail>(`/system/roles/${id}`),
    enabled: Boolean(id),
  });
}

export function useOrgsQuery() {
  return useApiQuery<OrgNode[]>({ queryKey: iamKeys.orgs(), queryFn: () => api.get<OrgNode[]>("/system/orgs") });
}

export function useUsersQuery(params: Record<string, string | number | boolean | undefined>, enabled = true) {
  return useApiQuery<PageOf<UserSummary>>({
    queryKey: iamKeys.users(params),
    queryFn: () => api.get<PageOf<UserSummary>>("/system/users", params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAuditLogsQuery(params: Record<string, string | number | undefined>) {
  return useApiQuery<PageOf<AuditLog>>({
    queryKey: iamKeys.auditLogs(params),
    queryFn: () => api.get<PageOf<AuditLog>>("/system/audit-logs", params),
    placeholderData: keepPreviousData,
  });
}

export function useSnapshotsQuery(objectType: string, objectId: string | null) {
  return useApiQuery<ChangeSnapshot[]>({
    queryKey: iamKeys.snapshots(objectType, objectId ?? "none"),
    queryFn: () => api.get<ChangeSnapshot[]>("/system/snapshots", { objectType, objectId }),
    enabled: Boolean(objectId),
  });
}

export function useSystemParamsQuery() {
  return useApiQuery<SystemParam[]>({
    queryKey: iamKeys.params(),
    queryFn: () => api.get<SystemParam[]>("/system/params"),
  });
}
