type Params = Record<string, string | number | boolean | undefined>;

export const documentKeys = {
  all: () => ["document"] as const,
  handoverLists: () => [...documentKeys.all(), "handovers"] as const,
  handoverList: (params: Params) => [...documentKeys.handoverLists(), params] as const,
  handovers: () => [...documentKeys.all(), "handover"] as const,
  handover: (id: string) => [...documentKeys.handovers(), id] as const,
  kbLists: () => [...documentKeys.all(), "kb"] as const,
  kbList: (params: Params) => [...documentKeys.kbLists(), params] as const,
};
