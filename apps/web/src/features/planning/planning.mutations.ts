import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { planningKeys } from "./planning.keys";

import type { PlanningDto } from "./planning.types";
import type { planningConfirmSchema, planningCreateSchema, planningUpdateSchema } from "@otd/contracts/planning";
import type { z } from "zod";

function useInvalidate() {
  const queryClient = useQueryClient();
  return async (detail?: PlanningDto) => {
    if (detail) queryClient.setQueryData(planningKeys.detail(detail.id), detail);
    await queryClient.invalidateQueries({ queryKey: planningKeys.lists() });
    await queryClient.invalidateQueries({ queryKey: ["sample"] });
  };
}

export function useCreatePlanningMutation() {
  const invalidate = useInvalidate();
  return useApiMutation<PlanningDto, z.input<typeof planningCreateSchema>>({
    mutationFn: (input) => api.post<PlanningDto>("/plannings", input, input.fileId ? { timeout: 180_000 } : {}),
    onSuccess: (detail) => invalidate(detail),
    onError: () => invalidate(),
  });
}

export function useUpdatePlanningMutation() {
  const invalidate = useInvalidate();
  return useApiMutation<PlanningDto, { id: string; input: z.input<typeof planningUpdateSchema> }>({
    mutationFn: ({ id, input }) => api.put<PlanningDto>(`/plannings/${id}`, input),
    onSuccess: (detail) => invalidate(detail),
  });
}

export function useConfirmPlanningMutation() {
  const invalidate = useInvalidate();
  return useApiMutation<PlanningDto, { id: string; input: z.input<typeof planningConfirmSchema> }>({
    mutationFn: ({ id, input }) => api.post<PlanningDto>(`/plannings/${id}/confirm`, input),
    onSuccess: (detail) => invalidate(detail),
  });
}

export function usePlanningActionMutation(action: "archive" | "recognize" | "manual") {
  const invalidate = useInvalidate();
  return useApiMutation<PlanningDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) =>
      api.post<PlanningDto>(
        `/plannings/${id}/${action}`,
        { version },
        action === "recognize" ? { timeout: 180_000 } : {},
      ),
    onSuccess: (detail) => invalidate(detail),
  });
}
