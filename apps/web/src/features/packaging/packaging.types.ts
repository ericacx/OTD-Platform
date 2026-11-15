import type {
  cartonAdjustSchema,
  cartonGenerateSchema,
  packagingConfirmSchema,
  packagingPlanCreateSchema,
  packagingPlanUpdateSchema,
} from "@otd/contracts/packaging";
import type { z } from "zod";

export type {
  CartonCoverageDto,
  CartonDto,
  PackagingPlanDetailDto,
  PackagingPlanDto,
  PackagingPlanField,
  PackagingVersionDiffDto,
  PackagingVersionDto,
} from "@otd/contracts/packaging";
export type { Page } from "@otd/contracts/common";
export type { OrderListItem } from "@otd/contracts/order";

export type PlanCreateInput = z.input<typeof packagingPlanCreateSchema>;
export type PlanUpdateInput = z.input<typeof packagingPlanUpdateSchema>;
export type PlanConfirmInput = z.input<typeof packagingConfirmSchema>;
export type CartonGenerateInput = z.input<typeof cartonGenerateSchema>;
export type CartonAdjustInput = z.input<typeof cartonAdjustSchema>;
