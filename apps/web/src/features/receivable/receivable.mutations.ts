import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { receivableKeys } from "./receivable.keys";

import type {
  InvoiceDto,
  ReceivableDto,
  collectionCreateSchema,
  disputeSchema,
  invoiceCreateSchema,
  offsetSchema,
  receiptCreateSchema,
  receivableCreateSchema,
} from "@otd/contracts/receivable";
import type { z } from "zod";

type Action<S extends z.ZodType> = { id: string; input: z.input<S> };

function useReceivableMutation<TData, TVariables>(fn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useApiMutation<TData, TVariables>({
    mutationFn: fn,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: receivableKeys.all() });
    },
  });
}

export function useCreateReceivableMutation() {
  return useReceivableMutation((input: z.input<typeof receivableCreateSchema>) =>
    api.post<ReceivableDto>("/receivables", input),
  );
}

export function useReceiptMutation() {
  return useReceivableMutation(({ id, input }: Action<typeof receiptCreateSchema>) =>
    api.post<ReceivableDto>(`/receivables/${id}/receipts`, input),
  );
}

export function useOffsetMutation() {
  return useReceivableMutation(({ id, input }: Action<typeof offsetSchema>) =>
    api.post<ReceivableDto>(`/receivables/${id}/offset`, input),
  );
}

export function useCollectionLogMutation() {
  return useReceivableMutation(({ id, input }: Action<typeof collectionCreateSchema>) =>
    api.post<ReceivableDto>(`/receivables/${id}/collections`, input),
  );
}

export function useDisputeMutation() {
  return useReceivableMutation(({ id, input }: Action<typeof disputeSchema>) =>
    api.post<ReceivableDto>(`/receivables/${id}/dispute`, input),
  );
}

export function useCreateInvoiceMutation() {
  return useReceivableMutation((input: z.input<typeof invoiceCreateSchema>) =>
    api.post<InvoiceDto>("/receivables/invoices", input),
  );
}
