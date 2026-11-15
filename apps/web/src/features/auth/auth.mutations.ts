import { useQueryClient } from "@tanstack/react-query";

import { clearTokenInfo, setTokenInfo } from "@/lib/auth/token-storage";
import { api } from "@/lib/http/client";
import { useApiMutation } from "@/lib/query/use-api-mutation";

import { authKeys } from "./auth.keys";
import { loginResultSchema, sessionUserSchema } from "./auth.schemas";

import type { LoginInput, LoginResult, PreferencesDto, SessionUser } from "./auth.types";

export async function loginRequest(input: LoginInput): Promise<LoginResult> {
  const raw = await api.post<unknown>("/auth/login", input, { extras: { noAuth: true } });
  return loginResultSchema.parse(raw);
}

export function logoutRequest() {
  return api.post<null>("/auth/logout");
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useApiMutation<LoginResult, LoginInput>({
    mutationFn: loginRequest,
    onSuccess(response) {
      setTokenInfo({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresAt: response.expiresAt,
      });
      queryClient.setQueryData(authKeys.session(), response.user);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useApiMutation<void, void>({
    async mutationFn() {
      try {
        await logoutRequest();
      } catch {
        return;
      }
    },
    onSettled() {
      clearTokenInfo();
      queryClient.clear();
    },
  });
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<null, { oldPassword: string; newPassword: string }>({
    mutationFn: (input) => api.post<null>("/me/password", input),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: authKeys.session() });
    },
  });
}

export function useUpdatePreferencesMutation() {
  const queryClient = useQueryClient();
  return useApiMutation<SessionUser, PreferencesDto>({
    mutationFn: async (input) => sessionUserSchema.parse(await api.put<unknown>("/me/preferences", input)),
    onSuccess(session) {
      queryClient.setQueryData(authKeys.session(), session);
    },
  });
}
