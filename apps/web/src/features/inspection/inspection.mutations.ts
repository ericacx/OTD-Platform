import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { inspectionKeys } from "./inspection.keys";

import type {
  InspectionDto,
  inspectionCancelSchema,
  inspectionCreateSchema,
  inspectionRecordSchema,
  inspectionReleaseSchema,
  inspectionReworkSchema,
  inspectionScheduleSchema,
} from "@otd/contracts/inspection";
import type { z } from "zod";

type Action<S extends z.ZodType> = { id: string; input: z.input<S> };

function useInspectionMutation<TVariables>(fn: (variables: TVariables) => Promise<InspectionDto>) {
  const queryClient = useQueryClient();
  return useApiMutation<InspectionDto, TVariables>({
    mutationFn: fn,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: inspectionKeys.all() });
    },
  });
}

export function useCreateInspectionMutation() {
  return useInspectionMutation((input: z.input<typeof inspectionCreateSchema>) =>
    api.post<InspectionDto>("/inspections", input),
  );
}

export function useScheduleInspectionMutation() {
  return useInspectionMutation(({ id, input }: Action<typeof inspectionScheduleSchema>) =>
    api.post<InspectionDto>(`/inspections/${id}/schedule`, input),
  );
}

export function useRecordInspectionMutation() {
  return useInspectionMutation(({ id, input }: Action<typeof inspectionRecordSchema>) =>
    api.post<InspectionDto>(`/inspections/${id}/result`, input),
  );
}

export function useReworkInspectionMutation() {
  return useInspectionMutation(({ id, input }: Action<typeof inspectionReworkSchema>) =>
    api.post<InspectionDto>(`/inspections/${id}/rework`, input),
  );
}

export function useCancelInspectionMutation() {
  return useInspectionMutation(({ id, input }: Action<typeof inspectionCancelSchema>) =>
    api.post<InspectionDto>(`/inspections/${id}/cancel`, input),
  );
}

export function useReleaseInspectionMutation() {
  return useInspectionMutation(({ id, input }: Action<typeof inspectionReleaseSchema>) =>
    api.post<InspectionDto>(`/inspections/${id}/release`, input),
  );
}
