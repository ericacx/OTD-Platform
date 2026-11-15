import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { testingKeys } from "./testing.keys";

import type { ReuseCheckResultDto, TestReportDto, TestRequestDetailDto } from "./testing.types";
import type {
  reportUpdateSchema,
  reuseCheckSchema,
  testCompleteSchema,
  testReceiveSchema,
  testRequestCreateSchema,
  testSubmitSchema,
} from "@otd/contracts/testing";
import type { z } from "zod";

function useRefresh() {
  const queryClient = useQueryClient();
  return async (detail?: TestRequestDetailDto) => {
    if (detail) queryClient.setQueryData(testingKeys.detail(detail.id), detail);
    await queryClient.invalidateQueries({ queryKey: testingKeys.all() });
  };
}

export function useReuseCheckMutation() {
  return useApiMutation<ReuseCheckResultDto, z.input<typeof reuseCheckSchema>>({
    mutationFn: (input) => api.post<ReuseCheckResultDto>("/tests/reuse-check", input),
  });
}

export function useCreateTestMutation() {
  const refresh = useRefresh();
  return useApiMutation<TestRequestDetailDto, z.input<typeof testRequestCreateSchema>>({
    mutationFn: (input) => api.post<TestRequestDetailDto>("/tests", input),
    onSuccess: (detail) => refresh(detail),
  });
}

type ActionInput =
  | { action: "submit"; input: z.input<typeof testSubmitSchema> }
  | { action: "receive"; input: z.input<typeof testReceiveSchema> }
  | { action: "complete"; input: z.input<typeof testCompleteSchema> }
  | { action: "retest"; input: { version: number } };

export function useTestActionMutation() {
  const refresh = useRefresh();
  return useApiMutation<TestRequestDetailDto, { id: string } & ActionInput>({
    mutationFn: ({ id, action, input }) => api.post<TestRequestDetailDto>(`/tests/${id}/${action}`, input),
    onSuccess: (detail) => refresh(detail),
  });
}

export function useUpdateReportMutation() {
  const refresh = useRefresh();
  return useApiMutation<TestReportDto, { id: string; input: z.input<typeof reportUpdateSchema> }>({
    mutationFn: ({ id, input }) => api.put<TestReportDto>(`/tests/reports/${id}`, input),
    onSuccess: () => refresh(),
  });
}
