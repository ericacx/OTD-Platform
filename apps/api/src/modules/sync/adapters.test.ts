import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { type AdapterEndpoint, MockAdapter, RestAdapter, SyncAdapterError, createAdapter } from "./adapters.js";
import { deriveCredentialKey, maskCredential, openCredential, sealCredential } from "./credential.js";

const base: AdapterEndpoint = { name: "test", protocol: "REST", baseUrl: null, timeoutMs: 30_000, options: {}, credential: null };
const rec = (key: string, attempt = 1) => ({ key, localId: null, data: { key }, attempt, idempotencyKey: `ORDER_DUE:${key}` });

let server: Server | null = null;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
}

describe("credential vault", () => {
  const key = deriveCredentialKey("otd-dev-secret-otd-dev-secret-otd-dev-secret");

  it("encrypts with AES-256-GCM and round-trips", () => {
    const sealed = sealCredential({ username: "otd-sync", password: "S3cret!" }, key);
    expect(JSON.stringify(sealed)).not.toContain("S3cret!");
    expect(JSON.stringify(sealed)).not.toContain("otd-sync");
    expect(openCredential(sealed, key)).toEqual({ username: "otd-sync", password: "S3cret!" });
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const sealed = sealCredential({ token: "abc" }, key);
    expect(openCredential({ ...sealed, tag: Buffer.alloc(16).toString("base64") }, key)).toBeNull();
    expect(openCredential(sealed, deriveCredentialKey("another-secret-another-secret-another"))).toBeNull();
    expect(openCredential(null, key)).toBeNull();
  });

  it("masks secrets fully and identifiers partially", () => {
    expect(maskCredential({ username: "otd-sync", password: "S3cret!", apiKey: "k-123456", pwd: "hunter22", cert: "-----BEGIN" })).toEqual({ username: "ot****nc", password: "******", apiKey: "******", pwd: "******", cert: "******" });
  });
});

describe("sync adapters", () => {
  it("mock injects failures by key and attempt", async () => {
    const mock = new MockAdapter({ ...base, protocol: "MOCK", options: { mock: { failures: [{ keys: ["A"], type: "TIMEOUT", times: 1 }, { keys: ["B"], type: "FORMAT_MISMATCH" }] } } });
    const first = await mock.push([rec("A"), rec("B"), rec("C")]);
    expect(first.map((r) => (r.ok ? "ok" : r.errorType))).toEqual(["TIMEOUT", "FORMAT_MISMATCH", "ok"]);
    const second = await mock.push([rec("A", 2), rec("B", 2)]);
    expect(second.map((r) => (r.ok ? "ok" : r.errorType))).toEqual(["ok", "FORMAT_MISMATCH"]);
  });

  it("mock pulls by watermark", async () => {
    const mock = new MockAdapter({ ...base, protocol: "MOCK", options: { mock: { dataset: [{ key: "1", updatedAt: "2026-10-01T00:00:00.000Z", data: {} }, { key: "2", updatedAt: "2026-10-02T00:00:00.000Z", data: {} }] } } });
    expect((await mock.pull(null)).records).toHaveLength(2);
    const inc = await mock.pull("2026-10-01T00:00:00.000Z");
    expect(inc.records.map((r) => r.key)).toEqual(["2"]);
    expect(inc.watermark).toBe("2026-10-02T00:00:00.000Z");
  });

  it("rest pushes with auth and maps per-record results", async () => {
    let seen: { auth?: string; body?: unknown } = {};
    const url = await listen((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen = { auth: req.headers.authorization, body: JSON.parse(body) };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ results: [{ key: "A", ok: true, remoteId: "R-1" }, { key: "B", ok: false, errorType: "MAPPING_MISS", message: "unknown size" }] }));
      });
    });
    const rest = new RestAdapter({ ...base, baseUrl: url, credential: { token: "t0k" } });
    const results = await rest.push([rec("A"), rec("B"), rec("C")]);
    expect(seen.auth).toBe("Bearer t0k");
    expect((seen.body as { records: unknown[] }).records).toHaveLength(3);
    expect(results).toEqual([
      { key: "A", ok: true, remoteId: "R-1" },
      { key: "B", ok: false, errorType: "MAPPING_MISS", message: "unknown size", field: null },
      { key: "C", ok: true, remoteId: null },
    ]);
  });

  it("rest classifies 503 as retryable and 400 as rejected", async () => {
    let status = 503;
    const url = await listen((_req, res) => {
      res.writeHead(status);
      res.end();
    });
    const rest = new RestAdapter({ ...base, baseUrl: url });
    expect((await rest.push([rec("A")]))[0]).toMatchObject({ ok: false, errorType: "REMOTE_UNAVAILABLE" });
    status = 400;
    expect((await rest.push([rec("A")]))[0]).toMatchObject({ ok: false, errorType: "REMOTE_REJECTED" });
    await expect(rest.pull(null)).rejects.toBeInstanceOf(SyncAdapterError);
  });

  it("rest times out through the abort signal", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const rest = new RestAdapter({ ...base, baseUrl: "http://remote.test", timeoutMs: 20 }, { fetch: hanging });
    expect((await rest.push([rec("A")]))[0]).toMatchObject({ ok: false, errorType: "TIMEOUT" });
  });

  it("rest reports unreachable endpoints without throwing", async () => {
    const rest = new RestAdapter({ ...base, baseUrl: "http://127.0.0.1:9" }, { testTimeoutMs: 2000 });
    const res = await rest.test();
    expect(res.ok).toBe(false);
    expect((await rest.push([rec("A")]))[0]).toMatchObject({ ok: false });
  });

  it("sftp and email are placeholders", async () => {
    for (const protocol of ["SFTP", "EMAIL"] as const) {
      const adapter = createAdapter({ ...base, protocol });
      expect((await adapter.test()).ok).toBe(false);
      expect((await adapter.push([rec("A")]))[0]).toMatchObject({ ok: false, errorType: "UNSUPPORTED" });
      await expect(adapter.pull(null)).rejects.toMatchObject({ errorType: "UNSUPPORTED" });
    }
  });
});
