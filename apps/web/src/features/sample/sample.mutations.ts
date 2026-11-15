import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { sampleKeys } from "./sample.keys";

import type { LibraryItemDto, MaterialDto, SampleDetailDto } from "./sample.types";
import type {
  libraryUpsertSchema,
  materialUpsertSchema,
  roundAdvanceSchema,
  roundApproveSchema,
  roundCreateSchema,
} from "@otd/contracts/sample";
import type { z } from "zod";

function useRefresh() {
  const queryClient = useQueryClient();
  return async (detail?: SampleDetailDto) => {
    if (detail) queryClient.setQueryData(sampleKeys.detail(detail.id), detail);
    await queryClient.invalidateQueries({ queryKey: sampleKeys.all() });
  };
}

export function useAdvanceRoundMutation() {
  const refresh = useRefresh();
  return useApiMutation<SampleDetailDto, { roundId: string; input: z.input<typeof roundAdvanceSchema> }>({
    mutationFn: ({ roundId, input }) => api.post<SampleDetailDto>(`/samples/rounds/${roundId}/advance`, input),
    onSuccess: (detail) => refresh(detail),
  });
}

export function useApproveRoundMutation() {
  const refresh = useRefresh();
  return useApiMutation<SampleDetailDto, { roundId: string; input: z.input<typeof roundApproveSchema> }>({
    mutationFn: ({ roundId, input }) => api.post<SampleDetailDto>(`/samples/rounds/${roundId}/approve`, input),
    onSuccess: (detail) => refresh(detail),
  });
}

export function useCreateRoundMutation() {
  const refresh = useRefresh();
  return useApiMutation<SampleDetailDto, { sampleId: string; input: z.input<typeof roundCreateSchema> }>({
    mutationFn: ({ sampleId, input }) => api.post<SampleDetailDto>(`/samples/${sampleId}/rounds`, input),
    onSuccess: (detail) => refresh(detail),
  });
}

export function useSaveLibraryMutation() {
  const refresh = useRefresh();
  return useApiMutation<LibraryItemDto, { id?: string; input: z.input<typeof libraryUpsertSchema> }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<LibraryItemDto>(`/samples/library/${id}`, input)
        : api.post<LibraryItemDto>("/samples/library", input),
    onSuccess: () => refresh(),
  });
}

export function useLibraryActionMutation() {
  const refresh = useRefresh();
  return useApiMutation<
    LibraryItemDto,
    { id: string; action: "lend" | "return"; input: { version: number; borrower?: string; location?: string } }
  >({
    mutationFn: ({ id, action, input }) => api.post<LibraryItemDto>(`/samples/library/${id}/${action}`, input),
    onSuccess: () => refresh(),
  });
}

export function useSaveMaterialMutation() {
  const refresh = useRefresh();
  return useApiMutation<MaterialDto, { id?: string; input: z.input<typeof materialUpsertSchema> }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<MaterialDto>(`/samples/materials/${id}`, input) : api.post<MaterialDto>("/samples/materials", input),
    onSuccess: () => refresh(),
  });
}

export function useArriveMaterialMutation() {
  const refresh = useRefresh();
  return useApiMutation<MaterialDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<MaterialDto>(`/samples/materials/${id}/arrive`, { version }),
    onSuccess: () => refresh(),
  });
}
