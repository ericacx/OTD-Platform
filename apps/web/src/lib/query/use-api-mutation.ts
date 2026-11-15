import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import type { HttpError } from "@/lib/http/errors";

/**
 * TanStack Query mutation wrapper with the shared axios error union
 * pre-bound as `TError`.
 */
export function useApiMutation<TData, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, HttpError, TVariables, TContext>,
) {
  return useMutation(options);
}
