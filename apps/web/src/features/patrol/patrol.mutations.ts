import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { BizError } from "@/lib/http/errors";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { patrolKeys } from "./patrol.keys";

import type { PatrolHitDto, PatrolHitHandleInput, PatrolRuleDto, PatrolRuleUpdateInput, PatrolRunResultDto } from "@otd/contracts/patrol";

export function useRunPatrolMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<PatrolRunResultDto>({
    mutationFn: () => api.post<PatrolRunResultDto>("/patrol/run"),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: patrolKeys.all() });
      await queryClient.invalidateQueries({ queryKey: ["todo"] });
    },
  });
}

export function useHandleHitMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<PatrolHitDto, { id: string; input: PatrolHitHandleInput }>({
    mutationFn: ({ id, input }) => api.post<PatrolHitDto>(`/patrol/hits/${id}/handle`, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: patrolKeys.dashboardAll() });
    },
    async onError(error) {
      if (error instanceof BizError && error.code === "COMMON_VERSION_CONFLICT") await queryClient.invalidateQueries({ queryKey: patrolKeys.dashboardAll() });
    },
  });
}

export function useUpdatePatrolRuleMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<PatrolRuleDto, { id: string; input: PatrolRuleUpdateInput }>({
    mutationFn: ({ id, input }) => api.put<PatrolRuleDto>(`/patrol/rules/${id}`, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: patrolKeys.rules() });
    },
    async onError(error) {
      if (error instanceof BizError && error.code === "COMMON_VERSION_CONFLICT") await queryClient.invalidateQueries({ queryKey: patrolKeys.rules() });
    },
  });
}
