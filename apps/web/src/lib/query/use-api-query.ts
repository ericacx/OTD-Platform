import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";

import type { HttpError } from "@/lib/http/errors";

/**
 * TanStack Query wrapper with the shared axios error union pre-bound as
 * `TError`. `query.error` is narrowable via `instanceof BizError` etc.
 */
export function useApiQuery<TData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, HttpError, TData, TQueryKey>,
) {
  return useQuery(options);
}
