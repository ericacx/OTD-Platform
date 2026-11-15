import type { capacityRowCreateSchema, ledgerTaskCompleteSchema } from "@otd/contracts/capacity";
import type { z } from "zod";

export type {
  BaseMachineDto,
  CapacityCompareDto,
  CapacityKpiDto,
  CapacityRowDto,
  CapacityVersionDetailDto,
  CapacityVersionDto,
  Ledger,
  LedgerTaskDto,
} from "@otd/contracts/capacity";
export { CAPACITY_TIGHT_RATE, CAPACITY_WINDOW_DAYS } from "@otd/contracts/capacity";

export type CapacityRowCreateInput = z.input<typeof capacityRowCreateSchema>;
export type LedgerTaskCompleteInput = z.input<typeof ledgerTaskCompleteSchema>;
