import { api } from "@/lib/http/client";
import { useApiQuery } from "@/lib/query/use-api-query";

import { authKeys } from "./auth.keys";
import { sessionUserSchema } from "./auth.schemas";

import type { SessionUser } from "./auth.types";

export async function fetchSession(): Promise<SessionUser> {
  const raw = await api.get<unknown>("/auth/session");
  return sessionUserSchema.parse(raw);
}

export function useSessionQuery(options: { enabled?: boolean } = {}) {
  return useApiQuery<SessionUser>({
    queryKey: authKeys.session(),
    queryFn: fetchSession,
    enabled: options.enabled ?? true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
