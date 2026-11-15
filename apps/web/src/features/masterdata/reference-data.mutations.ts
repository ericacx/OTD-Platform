import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { masterdataKeys } from "./masterdata.keys";
import { REFERENCE_PATHS, referenceDataKeys, type ReferenceEntity } from "./reference-data.keys";

export type SaveVariables<TInput> = { id?: string | undefined; input: TInput };
export type RemoveVariables = { id: string; version?: number | undefined };

function useInvalidateReference() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: referenceDataKeys.all() });
    await queryClient.invalidateQueries({ queryKey: masterdataKeys.lookups() });
  };
}

export function useSaveReferenceMutation<TDto, TInput>(entity: ReferenceEntity) {
  const invalidate = useInvalidateReference();
  const path = REFERENCE_PATHS[entity];
  return useApiMutation<TDto, SaveVariables<TInput>>({
    mutationFn: ({ id, input }) =>
      id ? api.put<TDto>(`${path}/${encodeURIComponent(id)}`, input) : api.post<TDto>(path, input),
    onSuccess: invalidate,
  });
}

export function useRemoveReferenceMutation(entity: ReferenceEntity) {
  const invalidate = useInvalidateReference();
  const path = REFERENCE_PATHS[entity];
  return useApiMutation<null, RemoveVariables>({
    mutationFn: ({ id, version }) =>
      api.delete<null>(`${path}/${encodeURIComponent(id)}`, version === undefined ? {} : { params: { version } }),
    onSuccess: invalidate,
  });
}
