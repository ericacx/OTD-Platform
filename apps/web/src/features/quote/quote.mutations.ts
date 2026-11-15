import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { quoteKeys } from "./quote.keys";

import type { CostItemInput, QuoteDto, QuoteExportForm, QuoteStrategyDto, StrategyParams } from "./quote.types";
import type { AxiosResponse } from "axios";

export type QuoteHeaderInput = {
  strategyId: string;
  factoryId: string | null;
  moq: number | null;
  targetPriceUsd: number | null;
  targetFx: number | null;
  targetSource: string | null;
  targetDate: string | null;
  note: string | null;
};

export type RoundInput = {
  kind: "INTERNAL" | "CUSTOMER";
  quantity: number;
  strategyId?: string;
  priceCny?: number;
  note?: string | null;
  overrideReason?: string;
  version: number;
};

export type StrategyInput = StrategyParams & {
  name: string;
  nameEn: string | null;
  enabled: boolean;
  reason?: string;
  version?: number;
};

function useQuoteInvalidate() {
  const queryClient = useQueryClient();
  return async (quote?: QuoteDto) => {
    if (quote) queryClient.setQueryData(quoteKeys.detail(quote.id), quote);
    await queryClient.invalidateQueries({ queryKey: quoteKeys.lists() });
    await queryClient.invalidateQueries({ queryKey: quoteKeys.details() });
    await queryClient.invalidateQueries({ queryKey: [...quoteKeys.all(), "style-options"] });
  };
}

export function useCreateQuoteMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<QuoteDto, QuoteHeaderInput & { styleId: string; costItems?: CostItemInput[] }>({
    mutationFn: (input) => api.post<QuoteDto>("/quotes", input),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useUpdateQuoteMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<
    QuoteDto,
    { id: string; input: Partial<QuoteHeaderInput> & { costItems?: CostItemInput[]; version: number } }
  >({
    mutationFn: ({ id, input }) => api.put<QuoteDto>(`/quotes/${id}`, input),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useCreateRoundMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<QuoteDto, { id: string; input: RoundInput }>({
    mutationFn: ({ id, input }) => api.post<QuoteDto>(`/quotes/${id}/rounds`, input),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useRoundFeedbackMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<
    QuoteDto,
    { id: string; roundId: string; result: "ACCEPTED" | "REJECTED"; note?: string | null; version: number }
  >({
    mutationFn: ({ id, roundId, ...body }) => api.post<QuoteDto>(`/quotes/${id}/rounds/${roundId}/feedback`, body),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useArchiveQuoteMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<QuoteDto, { id: string; version: number }>({
    mutationFn: ({ id, version }) => api.post<QuoteDto>(`/quotes/${id}/archive`, { version }),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useAttachQuoteFileMutation() {
  const invalidate = useQuoteInvalidate();
  return useApiMutation<QuoteDto, { id: string; fileId: string; version: number }>({
    mutationFn: ({ id, ...body }) => api.post<QuoteDto>(`/quotes/${id}/files`, body),
    onSuccess: (quote) => invalidate(quote),
  });
}

export function useSaveStrategyMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<QuoteStrategyDto, { id?: string; input: StrategyInput }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<QuoteStrategyDto>(`/quote-strategies/${id}`, input)
        : api.post<QuoteStrategyDto>("/quote-strategies", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: quoteKeys.strategies() });
      await queryClient.invalidateQueries({ queryKey: quoteKeys.details() });
    },
  });
}

function saveBlob(data: ArrayBuffer, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filenameOf(disposition: unknown): string | null {
  if (typeof disposition !== "string") return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
}

async function download(path: string, fallbackName: string, fallbackType: string) {
  const response = await api.get<AxiosResponse<ArrayBuffer>>(path, undefined, {
    responseType: "arraybuffer",
    extras: { returnRawResponse: true, isDownloadFile: true },
  });
  const type = response.headers["content-type"];
  saveBlob(
    response.data,
    filenameOf(response.headers["content-disposition"]) ?? fallbackName,
    typeof type === "string" ? type : fallbackType,
  );
}

export function downloadFile(id: string, filename: string, type = "application/octet-stream") {
  return download(`/files/${id}`, filename, type);
}

export function downloadQuoteExport(id: string, form: QuoteExportForm, filename: string) {
  return download(
    `/quotes/${id}/export/${form}`,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
