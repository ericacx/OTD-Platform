import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { masterdataKeys } from "./masterdata.keys";

import type { CustomerDto, PageOf } from "./masterdata.types";

export function useCustomersQuery(params: Record<string, string | number | undefined>) {
  return useApiQuery<PageOf<CustomerDto>>({
    queryKey: masterdataKeys.customers(params),
    queryFn: () => api.get<PageOf<CustomerDto>>("/masterdata/customers", params),
    placeholderData: keepPreviousData,
  });
}
