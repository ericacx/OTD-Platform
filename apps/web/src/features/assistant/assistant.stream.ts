import { refreshTokenOnce } from "@/lib/auth/refresh";
import { getAccessToken } from "@/lib/auth/token-storage";
import { config } from "@/lib/config";
import { bipoEnvelopeAdapter } from "@/lib/http/adapters";
import { AuthError, BizError, NetworkError, ServerError } from "@/lib/http/errors";

import type { AssistantReplyDto, PageContext } from "./assistant.types";

export type SseEvent = { event: string; data: string };

export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    if (data.length) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

export type StreamAskInput = {
  conversationId: string;
  content: string;
  context?: PageContext | undefined;
  language: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal | undefined;
};

function endpoint(conversationId: string): string {
  const path = `${config.apiBaseUrl.replace(/\/$/, "")}/assistant/conversations/${conversationId}/messages`;
  return new URL(path, window.location.origin).toString();
}

function traceId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function failureOf(response: Response): Promise<Error> {
  const raw: unknown = await response.json().catch(() => null);
  const bizError = raw === null ? null : bipoEnvelopeAdapter.extractError(raw);
  if (bizError) return bizError;
  if (response.status === 401) return new AuthError("Unauthorized", raw);
  if (response.status >= 500) return new ServerError(response.status, response.statusText, raw);
  return new NetworkError(`HTTP ${response.status}`, raw);
}

export async function streamAsk(input: StreamAskInput): Promise<AssistantReplyDto> {
  const body = JSON.stringify({ content: input.content, ...(input.context ? { context: input.context } : {}) });
  const send = (token: string | null) =>
    fetch(endpoint(input.conversationId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-LANGUAGE": input.language,
        "X-TimeZone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        "X-Trace-Id": traceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: input.signal ?? null,
    });

  let response: Response;
  try {
    response = await send(getAccessToken());
    if (response.status === 401) {
      let token: string;
      try {
        token = (await refreshTokenOnce()).accessToken;
      } catch (error) {
        if (error instanceof BizError) throw error;
        throw new AuthError(error instanceof Error ? error.message : "Unauthorized", error);
      }
      response = await send(token);
    }
  } catch (error) {
    if (error instanceof BizError || error instanceof AuthError) throw error;
    throw new NetworkError(error instanceof Error ? error.message : "Network error", error);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/event-stream") || !response.body) throw await failureOf(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseSseBuffer(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      const data = JSON.parse(event.data) as unknown;
      if (event.event === "delta") input.onDelta((data as { text: string }).text);
      if (event.event === "done") {
        await reader.cancel().catch(() => undefined);
        return data as AssistantReplyDto;
      }
      if (event.event === "error") {
        await reader.cancel().catch(() => undefined);
        const envelope = data as { errcode: string; errmsg?: string; errParams?: Record<string, unknown> };
        throw new BizError(
          String(envelope.errcode),
          envelope.errmsg ?? String(envelope.errcode),
          data,
          envelope.errParams ?? {},
        );
      }
    }
    if (done) break;
  }
  throw new NetworkError("Stream ended before the answer was complete");
}
