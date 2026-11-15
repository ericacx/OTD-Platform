import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { documentKeys } from "./document.keys";

import type { HandoverDto, KbDocumentDto, KbKind } from "./document.types";

export type KbInput = {
  kind: KbKind;
  title: string;
  customerId: string | null;
  tags: string[];
  content: string;
  fileId: string | null;
  version?: number;
};

function useHandoverInvalidate() {
  const queryClient = useQueryClient();
  return async (handover: HandoverDto) => {
    queryClient.setQueryData(documentKeys.handover(handover.id), handover);
    await queryClient.invalidateQueries({ queryKey: documentKeys.handoverLists() });
    await queryClient.invalidateQueries({ queryKey: ["quote"] });
  };
}

export function useCreateHandoverMutation() {
  const invalidate = useHandoverInvalidate();
  return useApiMutation<HandoverDto, { styleId: string }>({
    mutationFn: (input) => api.post<HandoverDto>("/handovers", input),
    onSuccess: invalidate,
  });
}

export function useHandoverTechPackMutation() {
  const invalidate = useHandoverInvalidate();
  return useApiMutation<HandoverDto, { id: string; fileId: string; version: number }>({
    mutationFn: ({ id, ...body }) => api.post<HandoverDto>(`/handovers/${id}/tech-pack`, body),
    onSuccess: invalidate,
  });
}

export function useCompleteHandoverMutation() {
  const invalidate = useHandoverInvalidate();
  return useApiMutation<HandoverDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<HandoverDto>(`/handovers/${id}/complete`, { version }),
    onSuccess: invalidate,
  });
}

export function useChangeHandoverMutation() {
  const invalidate = useHandoverInvalidate();
  return useApiMutation<HandoverDto, { id: string; reason: string; version: number }>({
    mutationFn: ({ id, ...body }) => api.post<HandoverDto>(`/handovers/${id}/change`, body),
    onSuccess: invalidate,
  });
}

export function useSaveKbDocumentMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<KbDocumentDto, { id?: string; input: KbInput }>({
    mutationFn: ({ id, input }) =>
      id ? api.put<KbDocumentDto>(`/kb-documents/${id}`, input) : api.post<KbDocumentDto>("/kb-documents", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: documentKeys.kbLists() });
    },
  });
}
