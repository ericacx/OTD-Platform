import "reflect-metadata";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Database } from "@otd/db";
import { DEMO_PASSWORD, type SeedRefs } from "@otd/db/seed";
import { createTestDatabase } from "@otd/db/testing";
import { AppModule } from "../app.module.js";
import { configureApp, createAdapter } from "../bootstrap.js";
import { FakeAiProvider } from "../core/ai/fake.provider.js";
import { Clock } from "../core/clock.js";
import { DB_HANDLE } from "../core/core.module.js";
import { MemoryStorage } from "../core/files/file-storage.js";
import { AI_PROVIDER, FILE_STORAGE } from "../core/tokens.js";

export const PHONES = {
  admin: "13800000000",
  sales: "13800000001",
  manager: "13800000002",
  gm: "13800000003",
  sales2: "13800000004",
  sales3: "13800000005",
  tech: "13800000006",
  quality: "13800000007",
  planner: "13800000008",
  buyer: "13800000009",
  customs: "13800000010",
  finance: "13800000011",
  production: "13800000012",
  sales4: "13800000013",
} as const;
export type Persona = keyof typeof PHONES;

export type CallResult<T = unknown> = { status: number; body: { errcode: 0 | string; errmsg?: string; errParams?: Record<string, unknown>; data: T; requestId: string } };

export type Caller = {
  get: <T = any>(path: string) => Promise<CallResult<T>>;
  post: <T = any>(path: string, body?: unknown) => Promise<CallResult<T>>;
  put: <T = any>(path: string, body?: unknown) => Promise<CallResult<T>>;
  patch: <T = any>(path: string, body?: unknown) => Promise<CallResult<T>>;
  del: <T = any>(path: string) => Promise<CallResult<T>>;
  upload: <T = any>(path: string, file: { filename: string; contentType: string; data: Buffer }, fields?: Record<string, string>) => Promise<CallResult<T>>;
  token: string;
  userId: string;
};

export type TestApp = {
  app: NestFastifyApplication;
  db: Database;
  clock: Clock;
  ai: FakeAiProvider;
  refs: SeedRefs;
  as: (persona: Persona) => Promise<Caller>;
  anon: Caller;
  close: () => Promise<void>;
};

export async function createTestApp(options: { demo?: boolean; now?: string } = {}): Promise<TestApp> {
  const { db, refs: seededRefs, close: closeDb } = await createTestDatabase({ seed: options.demo === false ? "reference" : "demo", ...(options.now ? { now: new Date(options.now) } : {}) });
  const refs = seededRefs!;
  const ai = new FakeAiProvider();
  process.env.NODE_ENV = "test";
  const { Test } = await import("@nestjs/testing");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB_HANDLE)
    .useValue({ db, kind: "pglite", close: async () => undefined, migrate: async () => undefined })
    .overrideProvider(FILE_STORAGE)
    .useValue(new MemoryStorage())
    .overrideProvider(AI_PROVIDER)
    .useValue(ai)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createAdapter());
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const clock = app.get(Clock);
  if (options.now) clock.set(options.now);

  const fastify = app.getHttpAdapter().getInstance();
  const make = (token: string, userId: string): Caller => {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) => {
      const res = await fastify.inject({ method, url: `/api/v1${path}`, headers: { ...headers, "x-language": "zh-CN" }, ...(body !== undefined ? { payload: body as object } : {}) });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    };
    return {
      token,
      userId,
      get: (p) => call("GET", p),
      post: (p, b) => call("POST", p, b ?? {}),
      put: (p, b) => call("PUT", p, b ?? {}),
      patch: (p, b) => call("PATCH", p, b ?? {}),
      del: (p) => call("DELETE", p),
      upload: async (p, file, fields = {}) => {
        const boundary = "----otdtestboundary";
        const parts: Buffer[] = [];
        for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`));
        parts.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
        const res = await fastify.inject({ method: "POST", url: `/api/v1${p}`, headers: { ...headers, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(parts) });
        return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
      },
    } as Caller;
  };
  const anon = make("", "");
  const sessions = new Map<Persona, Caller>();
  return {
    app,
    db,
    clock,
    ai,
    refs,
    anon,
    as: async (persona) => {
      const cached = sessions.get(persona);
      if (cached) return cached;
      const res = await anon.post<{ accessToken: string; user: { id: string } }>("/auth/login", { phone: PHONES[persona], password: DEMO_PASSWORD });
      if (res.status !== 200) throw new Error(`login failed for ${persona}: ${JSON.stringify(res.body)}`);
      const caller = make(res.body.data.accessToken, res.body.data.user.id);
      sessions.set(persona, caller);
      return caller;
    },
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}
