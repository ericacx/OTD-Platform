export const sampleKeys = {
  all: () => ["sample"] as const,
  lists: () => [...sampleKeys.all(), "list"] as const,
  list: (params: Record<string, string | number | undefined>) => [...sampleKeys.lists(), params] as const,
  detail: (id: string) => [...sampleKeys.all(), "detail", id] as const,
  libraryAll: () => [...sampleKeys.all(), "library"] as const,
  library: (params: Record<string, string | number | undefined>) => [...sampleKeys.libraryAll(), params] as const,
  materialsAll: () => [...sampleKeys.all(), "materials"] as const,
  materials: (params: Record<string, string | number | undefined>) => [...sampleKeys.materialsAll(), params] as const,
};
