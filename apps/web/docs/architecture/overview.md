# 架构总览

本模板是 React 19 + Vite 6 + TypeScript 6 构建的中后台业务 SPA，非 monorepo，面向 AI Coding 友好。

## 分层

```
src/app/         应用启动 · Provider · Router · ErrorBoundary
src/pages/       页面组装点（一页一目录，只组装不写业务）
src/features/    领域逻辑（queries · mutations · schemas · keys · 领域组件）
src/components/  无业务通用组件（layout · common · feedback · form · data-table · ui）
src/lib/         无业务基础库（http · query · auth · i18n · theme · utils · storage · config）
src/stores/      Zustand，仅 UI 状态与偏好，禁止装服务端数据
src/mocks/       MSW handlers（dev + 单测共用）
src/locales/     本地 fallback i18n 资源
```

依赖方向由 ESLint `no-restricted-imports` 硬约束（`eslint.config.js` 顶部）：

- `pages/` 不能 import `pages/*`（不能横向依赖别的页面）
- `features/` 不能 import `pages/*` `app/*`
- `components/` 不能 import `features/*` `pages/*` `stores/*` `app/*`
- `lib/` 不能 import 任何上层
- `stores/` 只放客户端 UI 状态

违反直接 lint 报错。任何一层如果需要跨层能力，让上层通过 props 注入或用 slot 传入。

## 数据流

```
UI (pages / features/components)
   │  ↕  action
   ▼
TanStack Query (useApiQuery / useApiMutation)
   │  ↕  axios request/response
   ▼
lib/http (interceptors + envelope adapter + refresh single-flight)
   │  ↕  HTTP
   ▼
backend  |  MSW handlers（dev/test）
```

- 服务端数据必须走 TanStack Query。禁止把接口结果放 Zustand。
- Zustand 只保存偏好（`theme`、`locale`、UI 折叠等）。
- Query key 由 `features/<domain>/<domain>.keys.ts` 集中生成，方便 invalidate 前缀。

## 路由与鉴权

- 使用 React Router v8 Data Mode（`createBrowserRouter + RouterProvider`）。
- 路由树在 `src/app/router/index.tsx`；页面用 `lazyRouteComponent` 分包。
- 受保护路径挂在 `<AuthGuard>` 下，内部通过 `useAuth()` 判断 `isAuthenticated / isLoading`。
- 需要细粒度权限时用 `<PermissionGuard>`（在 `route.handle.permissions/roles` 声明），或 UI 中用 `<RequirePermission code="user.edit">` 包裹。

## Provider 组合

`src/app/providers/app-providers.tsx` 顺序：

```
ThemeProvider
└ I18nProvider
  └ QueryProvider
    └ AuthProvider          // AuthProvider 依赖 QueryClient 才能拉 session
      └ ToastProvider
        └ RouterProvider    // Router 内部才能用 useAuth / navigate
```

顺序不可乱：ThemeProvider 挂在最外层是为了首帧就正确切主题（避免闪烁）；AuthProvider 必须在 QueryProvider 之内。

## MSW 生命周期

- Dev：`main.tsx` 在 `import.meta.env.DEV && config.enableMock` 为真时动态 import `@/mocks/browser`。
- 生产构建：Vite 常量折叠 `import.meta.env.DEV = false`，整段动态 import 被 tree-shake，MSW **不会** 打入产物。
- 测试：`src/test/setup.ts` 里 `server.listen` 启用 node 版 MSW，所有 `onUnhandledRequest: "error"`，任何未 mock 的请求都会失败。

## 相关文档

- [`conventions.md`](./conventions.md) — 命名 / 目录 / 提交
- [`api-layer.md`](./api-layer.md) — HTTP + envelope
- [`auth.md`](./auth.md) — 鉴权与权限
- [`i18n.md`](./i18n.md) — 国际化
- [`theming.md`](./theming.md) — 主题与 CSS 变量
- [`forms-and-tables.md`](./forms-and-tables.md) — 表单与表格
- [`testing.md`](./testing.md) — 测试策略
- [`deployment.md`](./deployment.md) — Docker · Nginx · CI
