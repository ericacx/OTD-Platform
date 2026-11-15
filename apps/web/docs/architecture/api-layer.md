# API 层

## 组成

```
src/lib/http/
  client.ts              axios 实例 + api.{get,post,put,patch,delete}
  interceptors.ts        request/response 拦截器 + 401 refresh + locale/trace/timezone header
  adapters.ts            bipoEnvelopeAdapter / restAdapter（响应信封适配）
  refresh-adapter.ts     refresh 具体实现（独立 axios，避免递归）
  errors.ts              BizError / AuthError / NetworkError / ServerError
  types.ts               ResponseAdapter / RequestExtras / ResponseEnvelope
```

## 响应信封切换

默认适配 `{ errcode, errmsg, data?, errParams? }`（`VITE_RESPONSE_ADAPTER=bipo`）。

新项目改一行即可切成透明的 REST：

```dotenv
# .env.local
VITE_RESPONSE_ADAPTER=rest
```

`client.ts` 会自动使用 `restAdapter`（直接透传 body）。若需要自定义 adapter，实现 `ResponseAdapter` 接口注册进 `adapterRegistry` 即可。

## 请求出口

领域层用 `api`：

```ts
import { api } from "@/lib/http/client";

const users = await api.get<User[]>("/users", { keyword: "a" });
const created = await api.post<User>("/users", payload);
```

返回值已经 unwrap，业务层直接拿数据。所有请求自动带：

- `Authorization: Bearer <token>`（`extras.noAuth` 可跳过）
- `X-LANGUAGE: <locale>`（`setLocaleGetter` 注入的语言）
- `X-TimeZone: <IANA>`
- `X-Trace-Id: <uuid>`
- `multipart/form-data` 头（`extras.isUploadFile` 时）

## RequestExtras 开关

```ts
api.post<Foo>("/foo", body, {
  extras: {
    noAuth: true, // 不带 Authorization
    noErrorToast: true, // 业务层承接错误，不弹全局 Toast
    returnRawResponse: true, // 拿到完整 AxiosResponse，跳过 adapter
    isUploadFile: true, // multipart
    isDownloadFile: true, // 流式下载
  },
});
```

## 401 refresh 单例锁

- 拦截器在 401 时调用 `refreshTokenOnce()`（`src/lib/auth/refresh.ts`）
- 单例 promise 保证并发 401 只发一次 refresh 请求
- refresh 成功后自动 replay 原请求；失败清 token 后继续抛 `AuthError`
- 具体 refresh 端点在 `src/lib/http/refresh-adapter.ts`（`/auth/refresh`），换后端时改这个文件
- App boot 时在 `src/app/App.tsx` 调用 `installRefreshHandler()` 注入

## 错误分类

| 场景                         | 抛出              |
| ---------------------------- | ----------------- |
| 无响应（网络断连、超时）     | `NetworkError`    |
| HTTP 401 且 refresh 失败     | `AuthError`       |
| HTTP 5xx 且 body 非 envelope | `ServerError`     |
| Body 是失败 envelope         | `BizError`        |
| 其他 axios 错误              | 原始 `AxiosError` |

## MSW 契约

MSW handler 必须返回完整 envelope 结构（`{ errcode, errmsg, data? }`），否则真机和 mock 会漏 bug。参见 `src/mocks/handlers/*.ts`。

## 添加新接口

1. 在 `features/<domain>/<domain>.queries.ts` 或 `<domain>.mutations.ts` 写 fetch 函数
2. Query key 走 `<domain>.keys.ts` 工厂
3. Mutation 在 `onSuccess` 里 `queryClient.invalidateQueries({ queryKey: xxxKeys.lists() })`
4. MSW handler 加到 `src/mocks/handlers/<domain>.ts`
5. 需要真接口时对齐后端 API 文档，别自造字段
