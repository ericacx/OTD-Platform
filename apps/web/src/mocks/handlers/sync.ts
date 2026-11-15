import { HttpResponse, http, type HttpHandler } from "msw";

import { envelope, fail, pageOf } from "./util";

import type {
  SyncBatchDto,
  SyncEndpointDto,
  SyncLogDto,
  SyncMappingDto,
  SyncRecordDto,
  SyncRunDto,
  SyncTaskDetailDto,
} from "@otd/contracts/sync";

const T0 = "2026-10-21T08:10:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

function endpoint(p: Partial<SyncEndpointDto> & Pick<SyncEndpointDto, "id" | "code" | "name">): SyncEndpointDto {
  return {
    kind: "CUSTOMER",
    customerId: null,
    customerName: null,
    protocol: "MOCK",
    baseUrl: null,
    contact: null,
    timeoutMs: 30000,
    options: {},
    status: "ACTIVE",
    ownerId: "u-12",
    ownerName: "黄磊",
    note: null,
    credential: { configured: false, updatedAt: null, masked: {} },
    lastTest: null,
    taskCount: 1,
    createdAt: at(-60 * 24 * 30),
    updatedAt: at(-60 * 24 * 30),
    version: 1,
    ...p,
  };
}

function initialState() {
  const endpoints: SyncEndpointDto[] = [
    endpoint({ id: "ep-erp", code: "ERP-HS", name: "环思 ERP（模拟）", kind: "ERP", taskCount: 2 }),
    endpoint({
      id: "ep-nsr",
      code: "NSR-SPL",
      name: "NSR 客户系统（模拟）",
      customerId: "c-nsr",
      customerName: "北岸运动",
      credential: { configured: true, updatedAt: at(-600), masked: { username: "ot****nc", password: "******" } },
      lastTest: { at: at(-60), ok: true, message: "模拟对端连接正常" },
    }),
    endpoint({
      id: "ep-mrn",
      code: "MRN-PORTAL",
      name: "MRN Supplier Portal",
      customerId: "c-mrn",
      customerName: "晨跑者",
      protocol: "REST",
      baseUrl: "https://supplier-portal.mrn.example/api/v1",
      lastTest: { at: at(-120), ok: false, message: "无法连接对端：fetch failed" },
    }),
  ];
  const mappings: SyncMappingDto[] = [
    {
      id: "map-nsr",
      name: "NSR 订单交期映射",
      endpointId: "ep-nsr",
      endpointName: "NSR 客户系统（模拟）",
      object: "ORDER_DUE",
      direction: "PUSH",
      keyField: null,
      fields: [
        { source: "poNo", target: "PONumber", transform: "trim", required: true },
        {
          source: "customerDueDate",
          target: "ShipDate",
          transform: "dateFormat",
          args: { to: "YYYY-MM-DD" },
          required: true,
        },
        { source: "factoryCode", target: "VendorSiteCode", transform: "codeMap", args: { map: "plant" } },
      ],
      codeMaps: { plant: { NH5: "SITE-NH5", DC1: "SITE-DC1" } },
      enabled: true,
      taskCount: 1,
      createdAt: at(-60 * 24 * 30),
      updatedAt: at(-60 * 24 * 10),
      version: 2,
    },
  ];
  const batches: SyncBatchDto[] = [0, 1, 2, 3].map((i) => ({
    id: `b-${i + 1}`,
    batchNo: `B0${i + 1}`,
    object: "ORDER_DUE" as const,
    startedAt: at(2 * (i + 1)),
    durationMs: 77_000,
    total: 373,
    success: i === 3 ? 371 : 373,
    failed: i === 3 ? 2 : 0,
    skipped: 0,
    status: i === 3 ? "PARTIAL" : "SUCCESS",
  }));
  const run: SyncRunDto = {
    id: "run-nsr",
    taskId: "task-nsr",
    trigger: "SCHEDULED",
    status: "PARTIAL",
    startedAt: T0,
    finishedAt: at(9),
    durationMs: 540_000,
    total: 1492,
    success: 1490,
    failed: 2,
    skipped: 0,
    steps: [
      { key: "START", at: T0, ok: true, message: null },
      { key: "RESULT", at: at(9), ok: true, message: "成功 1490 条，失败 2 条，跳过 0 条" },
      { key: "LOG", at: at(9), ok: true, message: "已写回日志" },
    ],
    error: null,
    operatorName: null,
    batches,
  };
  const record = (p: Partial<SyncRecordDto> & Pick<SyncRecordDto, "id" | "recordKey">): SyncRecordDto => ({
    taskId: "task-nsr",
    taskDocNo: "SYN-2026-003",
    taskName: "NSR 订单交期同步（OTD 平台 → 客户系统）",
    runId: "run-nsr",
    batchNo: "B04",
    field: null,
    errorType: "TIMEOUT",
    errorMessage: "外部系统 30 秒内未返回结果",
    suggestion: "链路重试；连续超时需联系对方系统运维",
    status: "RETRYING",
    queueState: "PENDING",
    attempts: 1,
    nextRetryAt: at(10),
    updatedAt: at(9),
    ...p,
  });
  const records: SyncRecordDto[] = [
    record({ id: "rec-1101", recordKey: "订单交期-1101" }),
    record({
      id: "rec-1102",
      recordKey: "订单交期-1102",
      field: "ShipWindowEnd",
      errorType: "FORMAT_MISMATCH",
      errorMessage: "来源日期格式与目标不一致",
      suggestion: "在转换规则里统一为 YYYY-MM-DD",
      status: "FAILED",
      queueState: "MANUAL",
      nextRetryAt: null,
    }),
    record({
      id: "rec-2201",
      recordKey: "测试报告-2201",
      taskId: "task-mrn",
      taskDocNo: "SYN-2026-005",
      taskName: "MRN 测试报告回传（OTD 平台 → MRN Supplier Portal）",
      runId: "run-mrn",
      batchNo: "B01",
      errorType: "CONNECTION_FAILED",
      errorMessage: "无法连接对端：fetch failed",
      suggestion: "检查对端地址与网络后重试",
      status: "FAILED",
      queueState: "ABANDONED",
      attempts: 6,
      nextRetryAt: null,
    }),
  ];
  const base = {
    mappingId: null,
    mappingName: null,
    customerId: null,
    customerName: null,
    customerCode: null,
    intervalMinutes: null,
    frequency: null,
    batchSize: 100,
    ownerId: "u-12",
    ownerName: "黄磊",
    watermark: null,
    note: null,
    openFailures: 0,
    disabledReason: null,
    consecutiveFailures: 0,
    createdAt: at(-60 * 24 * 30),
    updatedAt: at(-60 * 24 * 10),
    version: 1,
    latestRun: null,
    failures: [] as SyncRecordDto[],
  };
  const tasks: SyncTaskDetailDto[] = [
    {
      ...base,
      id: "task-erp",
      docNo: "SYN-2026-001",
      name: "环思 ERP 款式主数据同步（环思 ERP → OTD 平台）",
      endpointId: "ep-erp",
      endpointName: "环思 ERP（模拟）",
      endpointKind: "ERP",
      protocol: "MOCK",
      object: "STYLE",
      direction: "PULL",
      mode: "INCREMENTAL",
      trigger: "SCHEDULED",
      intervalMinutes: 60,
      frequency: "每小时",
      sourceSystem: "环思 ERP（模拟）",
      targetSystem: "OTD 平台",
      lastRunAt: at(-40),
      nextRunAt: at(20),
      lastStatus: "SUCCESS",
      enabled: true,
    },
    {
      ...base,
      id: "task-nsr",
      docNo: "SYN-2026-003",
      name: "NSR 订单交期同步（OTD 平台 → 客户系统）",
      endpointId: "ep-nsr",
      endpointName: "NSR 客户系统（模拟）",
      endpointKind: "CUSTOMER",
      protocol: "MOCK",
      mappingId: "map-nsr",
      mappingName: "NSR 订单交期映射",
      customerId: "c-nsr",
      customerName: "北岸运动",
      customerCode: "NSR",
      object: "ORDER_DUE",
      direction: "PUSH",
      mode: "INCREMENTAL",
      trigger: "SCHEDULED",
      intervalMinutes: 720,
      frequency: "每半天一次",
      sourceSystem: "OTD 平台",
      targetSystem: "NSR 客户系统（模拟）",
      lastRunAt: T0,
      nextRunAt: at(720),
      lastStatus: "PARTIAL",
      note: "少量记录因编码映射未命中失败，已进重试队列。",
      openFailures: 2,
      enabled: true,
      version: 2,
      latestRun: run,
      failures: records.filter((r) => r.taskId === "task-nsr"),
    },
  ];
  const logs: Record<string, SyncLogDto[]> = {
    "task-nsr": [
      {
        id: "l-3",
        at: at(9),
        userName: "system",
        action: "sync.run.finish",
        params: { status: "PARTIAL", success: 1490, failed: 2, skipped: 0 },
        summary: "执行完成",
      },
      {
        id: "l-2",
        at: T0,
        userName: "system",
        action: "sync.task.run",
        params: { trigger: "SCHEDULED" },
        summary: "开始执行",
      },
      {
        id: "l-1",
        at: at(-60 * 24 * 30),
        userName: "黄磊",
        action: "sync.task.create",
        params: {},
        summary: "创建同步任务",
      },
    ],
  };
  return { endpoints, mappings, tasks, records, logs };
}

let state = initialState();

export function resetSyncMock(): void {
  state = initialState();
}

const notFound = () => fail("COMMON_NOT_FOUND", "数据不存在或无权访问", 404);
const conflict = () => fail("COMMON_VERSION_CONFLICT", "数据已被他人修改，请刷新后重试", 409);

function filterBy<T extends object>(items: T[], url: URL, keys: (keyof T & string)[]): T[] {
  return items.filter((item) =>
    keys.every((k) => {
      const v = url.searchParams.get(k);
      return !v || String(item[k]) === v;
    }),
  );
}

function summary(task: SyncTaskDetailDto) {
  return { ...task, latestRun: undefined, failures: undefined };
}

function refreshTask(task: SyncTaskDetailDto): SyncTaskDetailDto {
  const failures = state.records.filter((r) => r.taskId === task.id);
  return { ...task, failures, openFailures: failures.length };
}

export const syncHandlers: HttpHandler[] = [
  http.get("*/sync/endpoints", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(envelope(pageOf(filterBy(state.endpoints, url, ["kind", "protocol", "status"]), url)));
  }),
  http.post("*/sync/endpoints", async ({ request }) => {
    const body = (await request.json()) as Partial<SyncEndpointDto> & { code: string; name: string };
    const created = endpoint({
      ...body,
      id: `ep-${state.endpoints.length + 1}`,
      credential: { configured: false, updatedAt: null, masked: {} },
    });
    state.endpoints.push(created);
    return HttpResponse.json(envelope(created), { status: 201 });
  }),
  http.put("*/sync/endpoints/:id/credential", async ({ params, request }) => {
    const ep = state.endpoints.find((e) => e.id === params.id);
    if (!ep) return notFound();
    const body = (await request.json()) as { credential: Record<string, string> | null; version: number };
    if (body.version !== ep.version) return conflict();
    ep.credential = body.credential
      ? {
          configured: true,
          updatedAt: T0,
          masked: Object.fromEntries(Object.keys(body.credential).map((k) => [k, "******"])),
        }
      : { configured: false, updatedAt: null, masked: {} };
    ep.version += 1;
    return HttpResponse.json(envelope(ep));
  }),
  http.put("*/sync/endpoints/:id", async ({ params, request }) => {
    const ep = state.endpoints.find((e) => e.id === params.id);
    if (!ep) return notFound();
    const body = (await request.json()) as Partial<SyncEndpointDto> & { version: number };
    if (body.version !== ep.version) return conflict();
    Object.assign(ep, body, { version: ep.version + 1 });
    return HttpResponse.json(envelope(ep));
  }),
  http.post("*/sync/endpoints/:id/test", ({ params }) => {
    const ep = state.endpoints.find((e) => e.id === params.id);
    if (!ep) return notFound();
    const ok = ep.protocol === "MOCK";
    ep.lastTest = { at: T0, ok, message: ok ? "模拟对端连接正常" : "无法连接对端：fetch failed" };
    return HttpResponse.json(
      envelope({ ok, latencyMs: ok ? 0 : 1200, message: ep.lastTest.message ?? "", testedAt: T0 }),
    );
  }),
  http.post("*/sync/endpoints/:id/:action", async ({ params, request }) => {
    const ep = state.endpoints.find((e) => e.id === params.id);
    if (!ep) return notFound();
    const body = (await request.json()) as { version: number };
    if (body.version !== ep.version) return conflict();
    ep.status = params.action === "enable" ? "ACTIVE" : "DISABLED";
    ep.version += 1;
    return HttpResponse.json(envelope(ep));
  }),

  http.get("*/sync/mappings", ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(
      envelope(pageOf(filterBy(state.mappings, url, ["object", "direction", "endpointId"]), url)),
    );
  }),
  http.post("*/sync/mappings/preview", async ({ request }) => {
    const body = (await request.json()) as {
      mappingId?: string;
      fields?: SyncMappingDto["fields"];
      codeMaps?: SyncMappingDto["codeMaps"];
      sample?: Record<string, unknown>;
    };
    const mapping = state.mappings.find((m) => m.id === body.mappingId);
    const fields = body.fields ?? mapping?.fields ?? [];
    const codeMaps = body.codeMaps ?? mapping?.codeMaps ?? {};
    const sample = body.sample ?? { poNo: "PO0010459", customerDueDate: "2026-11-21", factoryCode: "NH5" };
    const output: Record<string, unknown> = {};
    const errors: { field: string; source: string; type: "MAPPING_MISS"; message: string; suggestion: string }[] = [];
    for (const f of fields) {
      const value = sample[f.source];
      if (f.transform === "codeMap") {
        const name = typeof f.args?.map === "string" ? f.args.map : f.target;
        const hit = codeMaps[name]?.[String(value)];
        if (hit === undefined) {
          errors.push({
            field: f.target,
            source: f.source,
            type: "MAPPING_MISS",
            message: `码表「${name}」中没有「${String(value)}」的对应编码`,
            suggestion: `补充码表「${name}」后手动重试`,
          });
          continue;
        }
        output[f.target] = hit;
      } else {
        output[f.target] = value ?? null;
      }
    }
    return HttpResponse.json(envelope({ sample, output, errors, ok: errors.length === 0 }));
  }),
  http.get("*/sync/mappings/:id", ({ params }) => {
    const m = state.mappings.find((x) => x.id === params.id);
    return m ? HttpResponse.json(envelope(m)) : notFound();
  }),
  http.post("*/sync/mappings", async ({ request }) => {
    const body = (await request.json()) as Omit<SyncMappingDto, "id">;
    const created: SyncMappingDto = {
      ...state.mappings[0]!,
      ...body,
      id: `map-${state.mappings.length + 1}`,
      taskCount: 0,
      version: 1,
    };
    state.mappings.push(created);
    return HttpResponse.json(envelope(created), { status: 201 });
  }),
  http.put("*/sync/mappings/:id", async ({ params, request }) => {
    const m = state.mappings.find((x) => x.id === params.id);
    if (!m) return notFound();
    const body = (await request.json()) as Partial<SyncMappingDto> & { version: number };
    if (body.version !== m.version) return conflict();
    Object.assign(m, body, { version: m.version + 1 });
    return HttpResponse.json(envelope(m));
  }),

  http.get("*/sync/tasks", ({ request }) => {
    const url = new URL(request.url);
    const items = filterBy(state.tasks.map(refreshTask), url, ["object", "direction", "trigger", "lastStatus"]).map(
      summary,
    );
    return HttpResponse.json(envelope(pageOf(items, url)));
  }),
  http.get("*/sync/tasks/:id/logs", ({ params, request }) =>
    HttpResponse.json(envelope(pageOf(state.logs[String(params.id)] ?? [], new URL(request.url)))),
  ),
  http.get("*/sync/tasks/:id", ({ params }) => {
    const task = state.tasks.find((x) => x.id === params.id);
    return task ? HttpResponse.json(envelope(refreshTask(task))) : notFound();
  }),
  http.post("*/sync/tasks", async ({ request }) => {
    const body = (await request.json()) as Partial<SyncTaskDetailDto>;
    const created: SyncTaskDetailDto = {
      ...state.tasks[0]!,
      ...body,
      id: `task-${state.tasks.length + 1}`,
      docNo: `SYN-2026-00${state.tasks.length + 6}`,
      lastStatus: null,
      lastRunAt: null,
      latestRun: null,
      failures: [],
      version: 1,
    };
    state.tasks.push(created);
    return HttpResponse.json(envelope(created), { status: 201 });
  }),
  http.put("*/sync/tasks/:id", async ({ params, request }) => {
    const task = state.tasks.find((x) => x.id === params.id);
    if (!task) return notFound();
    const body = (await request.json()) as Partial<SyncTaskDetailDto> & { version: number };
    if (body.version !== task.version) return conflict();
    Object.assign(task, body, { version: task.version + 1 });
    return HttpResponse.json(envelope(refreshTask(task)));
  }),
  http.post("*/sync/tasks/:id/retry-failed", async ({ params, request }) => {
    const task = state.tasks.find((x) => x.id === params.id);
    if (!task) return notFound();
    const body = (await request.json()) as { version: number };
    if (body.version !== task.version) return conflict();
    const mine = state.records.filter((r) => r.taskId === task.id);
    state.records = state.records.filter((r) => r.taskId !== task.id);
    if (task.latestRun) {
      task.latestRun = {
        ...task.latestRun,
        status: "SUCCESS",
        success: task.latestRun.success + task.latestRun.failed,
        failed: 0,
        batches: task.latestRun.batches.map((b) => ({
          ...b,
          success: b.success + b.failed,
          failed: 0,
          status: "SUCCESS",
        })),
      };
    }
    task.lastStatus = "SUCCESS";
    (state.logs[task.id] ??= []).unshift({
      id: `l-${Date.now()}`,
      at: at(30),
      userName: "管理员",
      action: "sync.task.retry",
      params: { mode: "MANUAL", total: mine.length, success: mine.length, failed: 0 },
      summary: "",
    });
    const result = { total: mine.length, success: mine.length, failed: 0, pending: 0, abandoned: 0 };
    return HttpResponse.json(envelope({ result, task: refreshTask(task) }));
  }),
  http.post("*/sync/tasks/:id/:action", async ({ params, request }) => {
    const task = state.tasks.find((x) => x.id === params.id);
    if (!task) return notFound();
    const body = (await request.json()) as { version: number };
    if (body.version !== task.version) return conflict();
    if (params.action === "run") {
      if (!task.enabled) return fail("SYNC_TASK_DISABLED", "同步任务已停用，请先启用", 409);
      task.lastRunAt = at(20);
      task.latestRun = {
        ...(task.latestRun ?? state.tasks[1]!.latestRun!),
        id: `run-${Date.now()}`,
        trigger: "MANUAL",
        status: "SUCCESS",
        total: 1,
        success: 1,
        failed: 0,
        skipped: 0,
        batches: [],
      };
      task.lastStatus = "SUCCESS";
      return HttpResponse.json(envelope(refreshTask(task)));
    }
    task.enabled = params.action === "enable";
    task.version += 1;
    return HttpResponse.json(envelope(refreshTask(task)));
  }),

  http.get("*/sync/retry-queue", ({ request }) => {
    const url = new URL(request.url);
    const states = url.searchParams.get("state")?.split(",") ?? [];
    const items = state.records.filter((r) => !states.length || (r.queueState && states.includes(r.queueState)));
    return HttpResponse.json(envelope(pageOf(items, url)));
  }),
  http.post("*/sync/retry-queue/retry", async ({ request }) => {
    const body = (await request.json()) as { recordIds: string[] };
    const hit = state.records.filter((r) => body.recordIds.includes(r.id));
    state.records = state.records.filter((r) => !body.recordIds.includes(r.id));
    return HttpResponse.json(envelope({ total: hit.length, success: hit.length, failed: 0, pending: 0, abandoned: 0 }));
  }),
];
