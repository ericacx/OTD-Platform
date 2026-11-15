import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { masterdataKeys } from "./masterdata.keys";

import type { CustomerDto, CustomerUpsert } from "./masterdata.types";

export function useSaveCustomerMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<CustomerDto, { id?: string; input: CustomerUpsert }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<CustomerDto>(`/masterdata/customers/${id}`, input)
        : api.post<CustomerDto>("/masterdata/customers", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: masterdataKeys.customersAll() });
      await queryClient.invalidateQueries({ queryKey: masterdataKeys.lookups() });
    },
  });
}
