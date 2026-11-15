import { HttpResponse, http } from "msw";

import { sessionFor } from "../fixtures/iam";

import { envelope, fail } from "./util";

const TOKEN_PREFIX = "mock-access-";

function sessionFromRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const phone = header.startsWith(`Bearer ${TOKEN_PREFIX}`)
    ? header.slice(`Bearer ${TOKEN_PREFIX}`.length)
    : "13800000000";
  return sessionFor(phone) ?? sessionFor("13800000000");
}

export const authHandlers = [
  http.post("*/auth/login", async ({ request }) => {
    const body = (await request.json()) as { phone: string; password: string };
    const user = sessionFor(body.phone);
    if (!user || body.password !== "otd2026demo") {
      return fail("AUTH_INVALID_CREDENTIALS", "手机号或密码错误", 401);
    }
    return HttpResponse.json(
      envelope({
        accessToken: `${TOKEN_PREFIX}${body.phone}`,
        refreshToken: `mock-refresh-${body.phone}`,
        expiresAt: Date.now() + 15 * 60_000,
        user,
      }),
    );
  }),

  http.get("*/auth/session", ({ request }) => HttpResponse.json(envelope(sessionFromRequest(request)))),

  http.post("*/auth/refresh", async ({ request }) => {
    const body = (await request.json()) as { refreshToken?: string };
    if (!body.refreshToken?.startsWith("mock-refresh-"))
      return fail("AUTH_REFRESH_INVALID", "登录状态失效，请重新登录", 401);
    const phone = body.refreshToken.slice("mock-refresh-".length);
    return HttpResponse.json(
      envelope({
        accessToken: `${TOKEN_PREFIX}${phone}`,
        refreshToken: `mock-refresh-${phone}`,
        expiresAt: Date.now() + 15 * 60_000,
      }),
    );
  }),

  http.post("*/auth/logout", () => HttpResponse.json(envelope(null))),

  http.put("*/me/preferences", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const session = sessionFromRequest(request);
    return HttpResponse.json(envelope(session ? { ...session, preferences: body } : null));
  }),

  http.post("*/me/password", () => HttpResponse.json(envelope(null))),
];
