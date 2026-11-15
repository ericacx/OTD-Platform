import {
  arrivedNotSigned,
  etdPassedNotSailed,
  factoryReplyMissing,
  friFailedNoRework,
  inspectionLateSchedule,
  inspectionPreconditionMissing,
  ledgerOverdue,
  packingUnconfirmedNearInspection,
  poReviewOverdue,
  purchaseOverdue,
} from "./delivery.js";
import { handoverIncomplete, planningRecognizingStuck, planningUnconfirmed, quoteNoFeedback, reportExpiring, roundAwaitingApproval, roundStuckIssued, testOverdue } from "./development.js";
import type { PatrolRuleDefinition } from "./types.js";

type AnyRule = PatrolRuleDefinition<never>;

const ALL = [
  roundStuckIssued,
  roundAwaitingApproval,
  testOverdue,
  purchaseOverdue,
  planningRecognizingStuck,
  planningUnconfirmed,
  quoteNoFeedback,
  reportExpiring,
  poReviewOverdue,
  factoryReplyMissing,
  packingUnconfirmedNearInspection,
  inspectionPreconditionMissing,
  friFailedNoRework,
  inspectionLateSchedule,
  etdPassedNotSailed,
  arrivedNotSigned,
  ledgerOverdue,
  handoverIncomplete,
] as unknown as AnyRule[];

export const PATROL_RULE_TYPES: ReadonlyMap<string, PatrolRuleDefinition> = new Map(ALL.map((r) => [r.ruleType, r as unknown as PatrolRuleDefinition]));

export const RULE_PARAM_KEYS = ["thresholdDays"] as const;
