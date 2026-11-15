import { SYNC_ERROR_TYPES, type SyncErrorType, type SyncProtocol } from "@otd/contracts/sync";

export type OutboundRecord = { key: string; localId: string | null; data: Record<string, unknown>; attempt: number; idempotencyKey: string };
export type PushResult = { key: string; ok: true; remoteId?: string | null } | { key: string; ok: false; errorType: SyncErrorType; message: string; field?: string | null };
export type PulledRecord = { key: string; data: Record<string, unknown>; updatedAt?: string | null };
export type PullResult = { records: PulledRecord[]; watermark: string | null };
export type ConnectionResult = { ok: boolean; latencyMs: number; message: string };

export interface SyncAdapter {
  readonly protocol: SyncProtocol;
  test(): Promise<ConnectionResult>;
  push(records: OutboundRecord[]): Promise<PushResult[]>;
  pull(watermark: string | null): Promise<PullResult>;
}

export type AdapterEndpoint = {
  name: string;
  protocol: SyncProtocol;
  baseUrl: string | null;
  timeoutMs: number;
  options: Record<string, unknown>;
  credential: Record<string, string> | null;
};

export type AdapterDeps = { fetch?: typeof fetch; testTimeoutMs?: number };

export class SyncAdapterError extends Error {
  constructor(
    readonly errorType: SyncErrorType,
    message: string,
  ) {
    super(message);
    this.name = "SyncAdapterError";
  }
}

export type MockFailureRule = { keys?: string[]; type: SyncErrorType; times?: number; field?: string; message?: string };
export type MockOptions = { down?: boolean; failures?: MockFailureRule[]; dataset?: PulledRecord[] };

const reason = (type: SyncErrorType) => SYNC_ERROR_TYPES[type].reason.zh;

export class MockAdapter implements SyncAdapter {
  readonly protocol = "MOCK" as const;
  private readonly options: MockOptions;

  constructor(endpoint: AdapterEndpoint) {
    const mock = endpoint.options.mock;
    this.options = mock && typeof mock === "object" ? (mock as MockOptions) : {};
  }

  async test(): Promise<ConnectionResult> {
    if (this.options.down) return { ok: false, latencyMs: 0, message: "模拟对端不可用" };
    return { ok: true, latencyMs: 0, message: "模拟对端连接正常" };
  }

  async push(records: OutboundRecord[]): Promise<PushResult[]> {
    return records.map((r) => {
      if (this.options.down) return { key: r.key, ok: false, errorType: "CONNECTION_FAILED", message: "模拟对端不可用" };
      const rule = (this.options.failures ?? []).find((f) => (!f.keys || f.keys.includes(r.key)) && (f.times === undefined || r.attempt <= f.times));
      if (rule) return { key: r.key, ok: false, errorType: rule.type, message: rule.message ?? reason(rule.type), field: rule.field ?? null };
      return { key: r.key, ok: true, remoteId: `MOCK-${r.key}` };
    });
  }

  async pull(watermark: string | null): Promise<PullResult> {
    if (this.options.down) throw new SyncAdapterError("CONNECTION_FAILED", "模拟对端不可用");
    const rows = (this.options.dataset ?? []).filter((r) => !watermark || !r.updatedAt || r.updatedAt > watermark);
    const max = rows.reduce<string | null>((acc, r) => (r.updatedAt && (!acc || r.updatedAt > acc) ? r.updatedAt : acc), watermark);
    return { records: rows, watermark: max };
  }
}

export class RestAdapter implements SyncAdapter {
  readonly protocol = "REST" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly endpoint: AdapterEndpoint,
    private readonly deps: AdapterDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? globalThis.fetch;
  }

  private url(path: string): string {
    const base = (this.endpoint.baseUrl ?? "").replace(/\/+$/, "");
    return `${base}${path}`;
  }

  private headers(): Record<string, string> {
    const c = this.endpoint.credential ?? {};
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (c.token) h.authorization = `Bearer ${c.token}`;
    else if (c.username && c.password) h.authorization = `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`;
    if (c.apiKey) h["x-api-key"] = c.apiKey;
    return h;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(this.url(path), { ...init, headers: this.headers(), signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw new SyncAdapterError("TIMEOUT", `外部系统 ${Math.round(timeoutMs / 1000)} 秒内未返回结果`);
      throw new SyncAdapterError("CONNECTION_FAILED", `无法连接对端：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private statusError(status: number): SyncAdapterError {
    if (status === 429 || status >= 500) return new SyncAdapterError("REMOTE_UNAVAILABLE", `对端返回 HTTP ${status}`);
    return new SyncAdapterError("REMOTE_REJECTED", `对端返回 HTTP ${status}`);
  }

  async test(): Promise<ConnectionResult> {
    const started = performance.now();
    const timeout = Math.min(this.endpoint.timeoutMs, this.deps.testTimeoutMs ?? 10_000);
    try {
      const res = await this.request("", { method: "GET" }, timeout);
      const latencyMs = Math.round(performance.now() - started);
      return { ok: res.status < 500, latencyMs, message: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, latencyMs: Math.round(performance.now() - started), message: err instanceof Error ? err.message : String(err) };
    }
  }

  async push(records: OutboundRecord[]): Promise<PushResult[]> {
    if (!records.length) return [];
    try {
      const res = await this.request("/records", { method: "POST", body: JSON.stringify({ records: records.map((r) => ({ key: r.key, idempotencyKey: r.idempotencyKey, data: r.data })) }) }, this.endpoint.timeoutMs);
      if (!res.ok) throw this.statusError(res.status);
      const body = (await res.json().catch(() => ({}))) as { results?: { key: string; ok: boolean; remoteId?: string; errorType?: SyncErrorType; message?: string; field?: string }[] };
      const byKey = new Map((body.results ?? []).map((r) => [r.key, r]));
      return records.map((r): PushResult => {
        const hit = byKey.get(r.key);
        if (!hit || hit.ok) return { key: r.key, ok: true, remoteId: hit?.remoteId ?? null };
        const type = hit.errorType && hit.errorType in SYNC_ERROR_TYPES ? hit.errorType : "REMOTE_REJECTED";
        return { key: r.key, ok: false, errorType: type, message: hit.message ?? reason(type), field: hit.field ?? null };
      });
    } catch (err) {
      const e = err instanceof SyncAdapterError ? err : new SyncAdapterError("CONNECTION_FAILED", String(err));
      return records.map((r) => ({ key: r.key, ok: false as const, errorType: e.errorType, message: e.message }));
    }
  }

  async pull(watermark: string | null): Promise<PullResult> {
    const qs = watermark ? `?since=${encodeURIComponent(watermark)}` : "";
    const res = await this.request(`/records${qs}`, { method: "GET" }, this.endpoint.timeoutMs);
    if (!res.ok) throw this.statusError(res.status);
    const body = (await res.json().catch(() => ({}))) as { records?: PulledRecord[]; watermark?: string | null };
    return { records: body.records ?? [], watermark: body.watermark ?? watermark };
  }
}

export class UnsupportedAdapter implements SyncAdapter {
  constructor(readonly protocol: SyncProtocol) {}

  private message(): string {
    return `暂不支持 ${this.protocol} 连接方式`;
  }

  async test(): Promise<ConnectionResult> {
    return { ok: false, latencyMs: 0, message: this.message() };
  }

  async push(records: OutboundRecord[]): Promise<PushResult[]> {
    return records.map((r) => ({ key: r.key, ok: false as const, errorType: "UNSUPPORTED" as const, message: this.message() }));
  }

  async pull(): Promise<PullResult> {
    throw new SyncAdapterError("UNSUPPORTED", this.message());
  }
}

export function createAdapter(endpoint: AdapterEndpoint, deps: AdapterDeps = {}): SyncAdapter {
  if (endpoint.protocol === "MOCK") return new MockAdapter(endpoint);
  if (endpoint.protocol === "REST") return new RestAdapter(endpoint, deps);
  return new UnsupportedAdapter(endpoint.protocol);
}
