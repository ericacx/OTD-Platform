import type {
  flowDraftUpdateSchema,
  rulePackUpsertSchema,
  serviceItemUpsertSchema,
  serviceModuleUpsertSchema,
} from "@otd/contracts/flow";
import type { z } from "zod";

export type {
  EffectiveRulePackDto,
  FlowCardDto,
  FlowDetailDto,
  FlowDiffDto,
  FlowMigrateResult,
  FlowModuleView,
  FlowParams,
  FlowStatus,
  FlowVersionDto,
  MigrationPreviewDto,
  ModuleAssignResult,
  RuleKind,
  RulePackDto,
  RulePackSnapshotDto,
  ServiceItemDto,
  ServiceModuleDetailDto,
  ServiceModuleDto,
} from "@otd/contracts/flow";

export type ServiceModuleUpsert = z.input<typeof serviceModuleUpsertSchema>;
export type ServiceItemUpsert = z.input<typeof serviceItemUpsertSchema>;
export type FlowDraftUpdate = z.input<typeof flowDraftUpdateSchema>;
export type RulePackUpsert = z.input<typeof rulePackUpsertSchema>;
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
export type DraftModule = FlowDraftUpdate["modules"][number];
