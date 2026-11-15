import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { factoryauditKeys } from "./factoryaudit.keys";

import type {
  AuditCreateInput,
  AuditRecordInput,
  AuditUpdateInput,
  FactoryAuditDetailDto,
  FindingCreateInput,
  FindingDto,
  FindingUpdateInput,
} from "./factoryaudit.types";

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: factoryauditKeys.all() });
}

export function useSaveAuditMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FactoryAuditDetailDto, { id?: string; input: AuditCreateInput | AuditUpdateInput }>({
    mutationFn: ({ id, input }) =>
      id
        ? api.put<FactoryAuditDetailDto>(`/factory-audits/${id}`, input)
        : api.post<FactoryAuditDetailDto>("/factory-audits", input),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useStartAuditMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FactoryAuditDetailDto, { id: string; version: number; actualDate?: string }>({
    mutationFn: ({ id, ...body }) => api.post<FactoryAuditDetailDto>(`/factory-audits/${id}/start`, body),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useRecordAuditMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FactoryAuditDetailDto, { id: string; input: AuditRecordInput }>({
    mutationFn: ({ id, input }) => api.post<FactoryAuditDetailDto>(`/factory-audits/${id}/record`, input),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useCloseAuditMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FactoryAuditDetailDto, { id: string; version: number; note?: string }>({
    mutationFn: ({ id, ...body }) => api.post<FactoryAuditDetailDto>(`/factory-audits/${id}/close`, body),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useAddFindingMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FindingDto, { auditId: string; input: FindingCreateInput }>({
    mutationFn: ({ auditId, input }) => api.post<FindingDto>(`/factory-audits/${auditId}/findings`, input),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useUpdateFindingMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FindingDto, { id: string; input: FindingUpdateInput }>({
    mutationFn: ({ id, input }) => api.put<FindingDto>(`/factory-audits/findings/${id}`, input),
    async onSuccess() {
      await invalidate();
    },
  });
}

export function useCloseFindingMutation() {
  const invalidate = useInvalidateAll();
  return useApiMutation<FindingDto, { id: string; version: number; closeNote?: string }>({
    mutationFn: ({ id, ...body }) => api.post<FindingDto>(`/factory-audits/findings/${id}/close`, body),
    async onSuccess() {
      await invalidate();
    },
  });
}
