type Params = Record<string, string | number | boolean | undefined>;

export const quoteKeys = {
  all: () => ["quote"] as const,
  lists: () => [...quoteKeys.all(), "list"] as const,
  list: (params: Params) => [...quoteKeys.lists(), params] as const,
  details: () => [...quoteKeys.all(), "detail"] as const,
  detail: (id: string) => [...quoteKeys.details(), id] as const,
  strategies: () => [...quoteKeys.all(), "strategies"] as const,
  preview: (input: unknown) => [...quoteKeys.all(), "preview", input] as const,
  styleOptions: (params: Params) => [...quoteKeys.all(), "style-options", params] as const,
};
