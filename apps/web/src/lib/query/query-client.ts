import { QueryClient } from "@tanstack/react-query";

// Single source of truth for TanStack Query defaults. Every consumer (browser
// provider, tests, storybook) must create a fresh client via this factory so
// options never drift across surfaces.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        throwOnError: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
