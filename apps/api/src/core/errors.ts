import { type ErrorDef, commonErrors } from "@otd/contracts/errors";

export class AppError extends Error {
  constructor(
    readonly def: ErrorDef,
    readonly params: Record<string, unknown> = {},
  ) {
    super(def.code);
    this.name = "AppError";
  }

  get status(): number {
    return this.def.status;
  }
}

export const notFound = (what?: string) => new AppError(commonErrors.COMMON_NOT_FOUND, what ? { what } : {});
export const forbidden = (permission: string) => new AppError(commonErrors.IAM_FORBIDDEN, { permission });
export const versionConflict = () => new AppError(commonErrors.COMMON_VERSION_CONFLICT);
export const badRequest = (reason: string) => new AppError(commonErrors.COMMON_BAD_REQUEST, { reason });
export const duplicate = (field: string) => new AppError(commonErrors.COMMON_DUPLICATE, { field });
export const illegalTransition = (from: string, action: string) => new AppError(commonErrors.FLOW_ILLEGAL_TRANSITION, { from, action });
export const gateBlocked = (gate: "G1" | "G2", missing: string[]) =>
  new AppError(commonErrors.FLOW_GATE_BLOCKED, { gate, missing: missing.join("、"), missingKeys: missing });

export function assertFound<T>(value: T | undefined | null, what?: string): T {
  if (value === undefined || value === null) throw notFound(what);
  return value;
}
