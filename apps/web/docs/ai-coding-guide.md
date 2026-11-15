# AI Coding Guide

面向 Claude Code / Codex / Cursor / Gemini 等 AI 编程助手的上手手册。

## 读取顺序

1. `AGENTS.md`（或 `CLAUDE.md`）— 项目公约
2. `README.md` — 全局速览
3. `docs/architecture/overview.md` — 分层与依赖方向
4. 涉及请求 / 鉴权 / i18n / 主题 / 表单表格 / 测试 / 交付时，读对应的 `docs/architecture/*.md`
5. 涉及 spec 边界时，读 `docs/superpowers/specs/2026-07-07-frontend-react-template-design.md`
6. 工程化状态或版本时，读 `docs/engineering-assessment.md`

## 新页面流程

1. 确认页面所属 feature（若无则先做"新 feature 流程"）
2. 定义 Zod schema、Query key、queries / mutations
3. 编写 feature 内跨页面复用组件（`features/<name>/components/`）
4. 编写页面：`src/pages/<slug>/<slug>.page.tsx` + `<slug>.route.ts`
5. 注册路由到 `src/app/router/index.tsx`；受保护路径挂在 `<AuthGuard/>` 下，需要权限时加 `handle.permissions/roles` 后套 `<PermissionGuard/>`
6. 加 i18n key（zh-CN / en-US 同步；namespace 若新增，`local-backend.ts` + `types.d.ts` 都要 augment）
7. 加 MSW handler + 单元测试或集成测试
8. 跑：`pnpm typecheck && pnpm lint && pnpm test`；涉及主路径补 `pnpm e2e:smoke`

参考现成范例：`src/pages/users/*`、`src/features/users/*`。

## 新 Feature 流程

每个 feature 至少包含：

```
features/<name>/
  <name>.types.ts       (从 schema 推断，禁止手写 interface)
  <name>.schemas.ts     (Zod schema，所有输入输出走 schema)
  <name>.keys.ts        (Query key factory；支持前缀 invalidate)
  <name>.queries.ts     (useApiQuery 薄封装 + fetch 函数)
  <name>.mutations.ts   (useApiMutation；onSuccess 必须调 queryClient.invalidateQueries(lists()) 与相关 detail)
  components/           (跨页面复用的领域组件)
```

写完后跑 `pnpm typecheck && pnpm lint && pnpm test`；改到主路径则 `pnpm e2e:smoke`。

## 装 shadcn/ui 组件

```bash
npx shadcn@latest add <component>
```

组件落到 `src/components/ui/<component>.tsx`。不要修改 shadcn 生成的组件源码；若要项目化定制，另建外层包装组件。

## 加 i18n key

1. 在 `src/locales/zh-CN/<namespace>.json` 加 key
2. 在 `src/locales/en-US/<namespace>.json` 加同 key 的英文
3. 新 namespace 时同步：`src/lib/i18n/local-backend.ts` 的 `i18nNamespaces / localResources / AppResourceMap` + `src/lib/i18n/types.d.ts` 的 module augmentation
4. Zod schema 的 error message 也用 key，业务组件 `t(message as never)` 翻译

## Query 与 Zustand 判定

| 场景                               | 用什么                     |
| ---------------------------------- | -------------------------- |
| 来自接口的数据（列表、详情、分页） | TanStack Query             |
| 用户偏好（主题、语言、侧栏折叠）   | Zustand + persist          |
| 组件本地临时状态                   | `useState` / `useReducer`  |
| 表单状态                           | React Hook Form            |
| URL 参数                           | React Router search params |

**不确定时默认 TanStack Query，不要复制一份到 Zustand。**

## Router 规则

- 页面用 `lazyRouteComponent` 分包，避免把 feature 依赖打进首屏 bundle
- 受保护页面挂 `<AuthGuard/>`；需要细粒度权限的路径加 `handle.permissions` + `<PermissionGuard/>`
- 布局层组件在 `src/components/layout/`；路由容器（消费 `useAuth` / stores）在 `src/app/router/`
- URL 参数应通过 `useSearchParams()` 或 zod 校验的辅助 hook 消费

## i18n 规则

- 不写硬编码用户可见文案
- Key 格式：`{namespace}:{section}.{subKey}`（例：`users:list.title`）
- Zod schema 的 error message 也用 key，业务组件里 `t(message as never)` 翻译（详见 `src/features/auth/components/login-form.tsx`）
- 新 key 必须同时更新 zh-CN 和 en-US

## Mock 与测试规则

- HTTP mock 统一放 `src/mocks/handlers/`
- Handler 必须返回完整 envelope（`errcode: "0"` 或错误 code + 错误 HTTP status），保证 `bipoEnvelopeAdapter` 与 4xx envelope 抽 BizError 都能覆盖
- RTL 页面测试使用 `src/test/render-with-providers.tsx`（自动装载 i18n / QueryClient / AuthProvider / Router）
- Playwright smoke 使用 `VITE_ENABLE_MOCK=true` 的 dev server（因为 MSW 只在 DEV 编入 bundle）
- 每次改 mock / 请求层 / 拦截器都应把 `src/lib/http/adapters.test.ts` 与 `users.page.test.tsx` 至少扫一遍

## 反模式（Do Not）

- 跨层 import（ESLint 会打回）
- 把服务端数据放进 Zustand
- 用 `any` 绕过类型
- 前端 bundle 中放真实 token
- 新增 barrel export
- 修改 shadcn 生成的组件源码
- 忘记 mutation 的 `invalidateQueries`
- 忘记 zh-CN / en-US 同步

## 快速定位

| 想找什么      | 去哪里                                                        |
| ------------- | ------------------------------------------------------------- |
| 页面          | `src/pages/<name>/<name>.page.tsx`                            |
| 业务逻辑      | `src/features/<domain>/*`                                     |
| 通用组件      | `src/components/{common,feedback,form,data-table,layout,ui}/` |
| 库层          | `src/lib/{http,query,auth,i18n,theme,utils,storage,config}`   |
| Mock          | `src/mocks/handlers/<domain>.ts`                              |
| 样式          | `src/styles/globals.css`                                      |
| i18n 文案     | `src/locales/<lng>/<ns>.json`                                 |
| 路由树        | `src/app/router/index.tsx`                                    |
| Provider 组合 | `src/app/providers/app-providers.tsx`                         |
