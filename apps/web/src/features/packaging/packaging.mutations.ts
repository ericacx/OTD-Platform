import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { packagingKeys } from "./packaging.keys";

import type {
  CartonAdjustInput,
  CartonDto,
  CartonGenerateInput,
  PackagingPlanDetailDto,
  PlanConfirmInput,
  PlanCreateInput,
  PlanUpdateInput,
} from "./packaging.types";

export type PlanAction =
  | { kind: "submit"; version: number }
  | { kind: "return"; version: number; reason?: string | null }
  | ({ kind: "confirm" } & PlanConfirmInput);

export function useCreatePlanMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<PackagingPlanDetailDto, PlanCreateInput>({
    mutationFn: (input) => api.post<PackagingPlanDetailDto>("/packaging/plans", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: packagingKeys.plansAll() });
    },
  });
}

export function useUpdatePlanMutation(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<PackagingPlanDetailDto, PlanUpdateInput>({
    mutationFn: (input) => api.put<PackagingPlanDetailDto>(`/packaging/plans/${id}`, input),
    async onSuccess(detail) {
      queryClient.setQueryData(packagingKeys.plan(id), detail);
      await queryClient.invalidateQueries({ queryKey: packagingKeys.plansAll() });
    },
  });
}

export function usePlanActionMutation(id: string) {
  const queryClient = useQueryClient();
  return useApiMutation<PackagingPlanDetailDto, PlanAction>({
    mutationFn: ({ kind, ...body }) => api.post<PackagingPlanDetailDto>(`/packaging/plans/${id}/${kind}`, body),
    async onSuccess(detail) {
      queryClient.setQueryData(packagingKeys.plan(id), detail);
      await queryClient.invalidateQueries({ queryKey: packagingKeys.all() });
    },
  });
}

export function useGenerateCartonsMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<CartonDto[], CartonGenerateInput>({
    mutationFn: (input) => api.post<CartonDto[]>("/packaging/cartons/generate", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: packagingKeys.all() });
    },
  });
}

export function useAdjustCartonMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<CartonDto, { id: string; input: CartonAdjustInput }>({
    mutationFn: ({ id, input }) => api.put<CartonDto>(`/packaging/cartons/${id}`, input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: packagingKeys.all() });
    },
  });
}

export function useCartonActionMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<CartonDto, { id: string; kind: "start" | "finish"; version: number }>({
    mutationFn: ({ id, kind, version }) => api.post<CartonDto>(`/packaging/cartons/${id}/${kind}`, { version }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: packagingKeys.all() });
    },
  });
}
