import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { flowKeys } from "./flow.keys";

import type {
  FlowDetailDto,
  FlowDraftUpdate,
  FlowMigrateResult,
  ModuleAssignResult,
  RulePackDto,
  RulePackUpsert,
  ServiceItemDto,
  ServiceItemUpsert,
  ServiceModuleDetailDto,
  ServiceModuleUpsert,
} from "./flow.types";

function useInvalidateFlow() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: flowKeys.all() });
  };
}

export function useSaveModuleMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<ServiceModuleDetailDto, { id?: string; input: ServiceModuleUpsert }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<ServiceModuleDetailDto>(`/flow/modules/${id}`, input)
        : api.post<ServiceModuleDetailDto>("/flow/modules", input),
    onSuccess: invalidate,
  });
}

export function useSaveItemMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<ServiceItemDto, { id?: string; moduleId: string; input: ServiceItemUpsert }>({
    mutationFn: ({ id, moduleId, input }) =>
      id
        ? api.put<ServiceItemDto>(`/flow/items/${id}`, input)
        : api.post<ServiceItemDto>(`/flow/modules/${moduleId}/items`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteItemMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<null, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.delete<null>(`/flow/items/${id}`, { params: { version } }),
    onSuccess: invalidate,
  });
}

export function useDeleteModuleMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<null, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.delete<null>(`/flow/modules/${id}`, { params: { version } }),
    onSuccess: invalidate,
  });
}

export function useAssignModuleMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<ModuleAssignResult, { moduleId: string; customerIds: string[] }>({
    mutationFn: ({ moduleId, customerIds }) =>
      api.post<ModuleAssignResult>(`/flow/modules/${moduleId}/assign`, { customerIds }),
    onSuccess: invalidate,
  });
}

export function useSaveDraftMutation(customerId: string) {
  const queryClient = useQueryClient();
  return useApiMutation<FlowDetailDto, FlowDraftUpdate>({
    mutationFn: (input) => api.put<FlowDetailDto>(`/flow/customers/${customerId}/draft`, input),
    async onSuccess(data) {
      queryClient.setQueryData(flowKeys.customer(customerId), data);
      await queryClient.invalidateQueries({ queryKey: flowKeys.customersAll() });
      await queryClient.invalidateQueries({ queryKey: flowKeys.modulesAll() });
    },
  });
}

export function useCopyFlowMutation(customerId: string) {
  const invalidate = useInvalidateFlow();
  return useApiMutation<FlowDetailDto, { sourceCustomerId: string; version: number }>({
    mutationFn: (input) => api.post<FlowDetailDto>(`/flow/customers/${customerId}/copy`, input),
    onSuccess: invalidate,
  });
}

export function usePublishFlowMutation(customerId: string) {
  const invalidate = useInvalidateFlow();
  return useApiMutation<FlowDetailDto, { note?: string; version: number }>({
    mutationFn: (input) => api.post<FlowDetailDto>(`/flow/customers/${customerId}/publish`, input),
    onSuccess: invalidate,
  });
}

export function useRollbackFlowMutation(customerId: string) {
  const invalidate = useInvalidateFlow();
  return useApiMutation<FlowDetailDto, { versionId: string; reason: string; version: number }>({
    mutationFn: (input) => api.post<FlowDetailDto>(`/flow/customers/${customerId}/rollback`, input),
    onSuccess: invalidate,
  });
}

export function useMigrateOrdersMutation(customerId: string) {
  const invalidate = useInvalidateFlow();
  return useApiMutation<FlowMigrateResult, { targetVersionId: string; orderIds?: string[] }>({
    mutationFn: (input) => api.post<FlowMigrateResult>(`/flow/customers/${customerId}/migrate`, input),
    onSuccess: invalidate,
  });
}

export function useSaveRulePackMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<RulePackDto, { id?: string; input: RulePackUpsert }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<RulePackDto>(`/flow/rule-packs/${id}`, input) : api.post<RulePackDto>("/flow/rule-packs", input),
    onSuccess: invalidate,
  });
}

export function useDeleteRulePackMutation() {
  const invalidate = useInvalidateFlow();
  return useApiMutation<null, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.delete<null>(`/flow/rule-packs/${id}`, { params: { version } }),
    onSuccess: invalidate,
  });
}

export function useRollbackRulePackMutation(id: string) {
  const invalidate = useInvalidateFlow();
  return useApiMutation<RulePackDto, { snapshotId: string; reason: string }>({
    mutationFn: (input) => api.post<RulePackDto>(`/flow/rule-packs/${id}/rollback`, input),
    onSuccess: invalidate,
  });
}
