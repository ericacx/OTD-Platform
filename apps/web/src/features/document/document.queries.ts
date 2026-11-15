import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { documentKeys } from "./document.keys";

import type { HandoverDto, KbDocumentDto, PageOf } from "./document.types";

type Params = Record<string, string | number | boolean | undefined>;

export function useHandoversQuery(params: Params) {
  return useApiQuery<PageOf<HandoverDto>>({
    queryKey: documentKeys.handoverList(params),
    queryFn: () => api.get<PageOf<HandoverDto>>("/handovers", params),
    placeholderData: keepPreviousData,
  });
}

export function useHandoverQuery(id: string | undefined) {
  return useApiQuery<HandoverDto>({
    queryKey: documentKeys.handover(id ?? "none"),
    queryFn: () => api.get<HandoverDto>(`/handovers/${id}`),
    enabled: Boolean(id),
  });
}

export function useKbDocumentsQuery(params: Params) {
  return useApiQuery<PageOf<KbDocumentDto>>({
    queryKey: documentKeys.kbList(params),
    queryFn: () => api.get<PageOf<KbDocumentDto>>("/kb-documents", params),
    placeholderData: keepPreviousData,
  });
}
