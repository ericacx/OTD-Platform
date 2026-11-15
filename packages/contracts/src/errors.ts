export type ErrorDef = { code: string; status: number; message: { zh: string; en: string } };

export function defineErrors<const T extends Record<string, { status: number; zh: string; en: string }>>(defs: T): { [K in keyof T]: ErrorDef } {
  const out = {} as { [K in keyof T]: ErrorDef };
  for (const key of Object.keys(defs) as (keyof T & string)[]) {
    const d = defs[key]!;
    out[key] = { code: key, status: d.status, message: { zh: d.zh, en: d.en } };
  }
  return out;
}

export function formatMessage(template: string, params: Record<string, unknown> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] === undefined ? `{${k}}` : String(params[k])));
}

export const commonErrors = defineErrors({
  COMMON_VALIDATION_FAILED: { status: 422, zh: "请求参数校验失败", en: "Validation failed" },
  COMMON_NOT_FOUND: { status: 404, zh: "数据不存在或无权访问", en: "Not found or not accessible" },
  COMMON_VERSION_CONFLICT: { status: 409, zh: "数据已被他人修改，请刷新后重试", en: "Modified by someone else, please refresh" },
  COMMON_DUPLICATE: { status: 409, zh: "{field} 已存在", en: "{field} already exists" },
  COMMON_RATE_LIMITED: { status: 429, zh: "操作太频繁，请稍后再试", en: "Too many requests" },
  COMMON_INTERNAL: { status: 500, zh: "系统繁忙，请稍后再试", en: "Internal error" },
  COMMON_BAD_REQUEST: { status: 400, zh: "{reason}", en: "{reason}" },
  AUTH_UNAUTHENTICATED: { status: 401, zh: "请先登录", en: "Please sign in" },
  AUTH_INVALID_CREDENTIALS: { status: 401, zh: "手机号或密码错误", en: "Invalid phone or password" },
  AUTH_ACCOUNT_LOCKED: { status: 423, zh: "账号已锁定，请于 {unlockAt} 后重试", en: "Account locked until {unlockAt}" },
  AUTH_ACCOUNT_DISABLED: { status: 403, zh: "账号已停用", en: "Account disabled" },
  AUTH_TOKEN_EXPIRED: { status: 401, zh: "登录已过期", en: "Session expired" },
  AUTH_REFRESH_INVALID: { status: 401, zh: "登录状态失效，请重新登录", en: "Session invalid, please sign in again" },
  AUTH_PASSWORD_WEAK: { status: 422, zh: "密码至少 10 位且包含字母和数字", en: "Password needs 10+ chars with letters and digits" },
  IAM_FORBIDDEN: { status: 403, zh: "没有「{permission}」权限", en: "Missing permission {permission}" },
  FLOW_ILLEGAL_TRANSITION: { status: 409, zh: "当前状态「{from}」不允许执行「{action}」", en: "Action {action} not allowed from {from}" },
  FLOW_GATE_BLOCKED: { status: 409, zh: "{gate} 条件未满足：{missing}", en: "{gate} blocked: {missing}" },
  FLOW_NODE_NOT_APPLICABLE: { status: 409, zh: "该客户流程未启用此环节", en: "Node not enabled for this customer" },
});
