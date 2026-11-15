import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { iamKeys } from "./iam.keys";

import type { OrgNode, RoleDetail, RoleSummary, SystemParam, UserSummary } from "./iam.types";
import type { orgUpsertSchema, roleGrantSchema, roleUpsertSchema, userUpsertSchema } from "@otd/contracts/iam";
import type { z } from "zod";

type RoleUpsert = z.input<typeof roleUpsertSchema>;
type RoleGrant = z.infer<typeof roleGrantSchema>;
type OrgUpsert = z.input<typeof orgUpsertSchema>;
type UserUpsert = z.input<typeof userUpsertSchema>;

export function useSaveRoleMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<RoleSummary, { id?: string; input: RoleUpsert }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<RoleSummary>(`/system/roles/${id}`, input) : api.post<RoleSummary>("/system/roles", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.roles() });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, string>({
    mutationFn: (id) => api.delete<null>(`/system/roles/${id}`),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.roles() });
    },
  });
}

export function useGrantRoleMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<RoleDetail, { id: string; input: RoleGrant }>({
    mutationFn: ({ id, input }) => api.put<RoleDetail>(`/system/roles/${id}/grants`, input),
    async onSuccess(detail) {
      queryClient.setQueryData(iamKeys.role(detail.id), detail);
      await queryClient.invalidateQueries({ queryKey: iamKeys.roles() });
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

export function useSaveOrgMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<OrgNode, { id?: string; input: OrgUpsert }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<OrgNode>(`/system/orgs/${id}`, input) : api.post<OrgNode>("/system/orgs", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.orgs() });
    },
  });
}

export function useDeleteOrgMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, string>({
    mutationFn: (id) => api.delete<null>(`/system/orgs/${id}`),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.orgs() });
    },
  });
}

export function useSaveUserMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<UserSummary & { initialPassword?: string }, { id?: string; input: UserUpsert }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<UserSummary>(`/system/users/${id}`, input)
        : api.post<UserSummary & { initialPassword: string }>("/system/users", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.usersAll() });
      await queryClient.invalidateQueries({ queryKey: iamKeys.orgs() });
      await queryClient.invalidateQueries({ queryKey: iamKeys.roles() });
    },
  });
}

export function useResetPasswordMutation() {
  return useApiMutation<{ initialPassword: string }, string>({
    mutationFn: (id) => api.post<{ initialPassword: string }>(`/system/users/${id}/reset-password`),
  });
}

export function useRollbackMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, { snapshotId: string; reason: string }>({
    mutationFn: ({ snapshotId, reason }) => api.post<null>(`/system/snapshots/${snapshotId}/rollback`, { reason }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.all() });
    },
  });
}

export function useUpdateParamMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SystemParam, { key: string; value: unknown; reason?: string | undefined }>({
    mutationFn: ({ key, value, reason }) =>
      api.put<SystemParam>(`/system/params/${encodeURIComponent(key)}`, { value, reason }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: iamKeys.params() });
    },
  });
}
