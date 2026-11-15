import type { BoardKey, PeriodKey } from "@otd/contracts/metrics";

export type BoardParams = { period: PeriodKey; orgId?: string | undefined; customerId?: string | undefined; tab?: string | undefined };
export type DiagnosisParams = Omit<BoardParams, "tab">;

export const metricsKeys = {
  all: () => ["metrics"] as const,
  board: (board: BoardKey, params: BoardParams) => [...metricsKeys.all(), "board", board, params] as const,
  diagnosisAll: (board: BoardKey) => [...metricsKeys.all(), "diagnosis", board] as const,
  diagnosis: (board: BoardKey, params: DiagnosisParams) => [...metricsKeys.diagnosisAll(board), params] as const,
  definitions: () => [...metricsKeys.all(), "definitions"] as const,
};
