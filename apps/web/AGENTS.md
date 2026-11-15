# Repository Guidelines

## 当前状态

本仓库是 React 前端模板的 Core 实现，已完成第二轮工程化修复。所有 6 条工程化命令都必须保持 `exit 0`。修改代码前先看：

- `README.md`
- `docs/ai-coding-guide.md`
- `docs/architecture/*.md`
- `docs/superpowers/specs/2026-07-07-frontend-react-template-design.md`

## 技术基线

- React 19.2 · Vite 8.1 · TypeScript 6 strict
- React Router v8 Data Mode
- TanStack Query v5 · Zustand v5
- shadcn/ui + Tailwind CSS v4 · lucide-react · sonner · cmdk
- axios + 可插拔 envelope adapter（`bipo` / `rest`，`VITE_RESPONSE_ADAPTER` 一行切换）
- react-i18next（本地资源，每个业务模块一个 namespace）
- Vitest + React Testing Library + MSW + Playwright

## 目录边界（ESLint 硬约束）

- `src/app/`：应用启动、Provider、Router、ErrorBoundary
- `src/pages/`：页面组装 + 路由挂载点，不写可复用业务
- `src/features/`：领域逻辑、query、mutation、schema、领域组件
- `src/components/`：无业务通用组件
- `src/lib/`：无业务基础库，不依赖 `pages/features/components/stores/app`
- `src/stores/`：仅 UI 状态与偏好，禁止装服务端数据

任何跨层 import 会被 `no-restricted-imports` 打回。

## 状态规则

- 服务端数据必须走 TanStack Query。
- Zustand 不允许保存服务端列表 / 详情 / 分页结果或接口响应。
- Query key 必须由 `features/<domain>/<domain>.keys.ts` 集中生成，方便前缀 invalidate。
- Mutation `onSuccess` 必须写 invalidate（详见 `src/features/users/users.mutations.ts` 参考实现）。

## API 规则

- 请求层通过 `import { api } from "@/lib/http/client"` 消费，禁止 `window.$request`。
- 默认响应信封 `{ errcode, errmsg, data?, errParams? }`；`VITE_RESPONSE_ADAPTER=rest` 可切换 REST 透传。
- 拦截器已经处理：`Authorization` / `X-LANGUAGE` / `X-TimeZone` / `X-Trace-Id` / 401 refresh 单例锁 / 4xx envelope 抽 BizError / arraybuffer JSON 错误解码。
- 浏览器运行时不得读取真实密钥。启动时 `src/lib/config.ts` 会拒绝任何 `VITE_*TOKEN` / `VITE_*SECRET` / `VITE_*PASSWORD` 变量。

## Auth 规则

- 组件里用 `useAuth()` 拿 `user / isAuthenticated / isLoading / hasPermission / hasRole / logout`。
- 路由级权限声明：在 route 配置里 `handle: { permissions: [...], roles: [...] }`，然后套 `<PermissionGuard/>`。
- UI 级权限：`<RequirePermission code="user.edit" fallback={<X/>}>` 或 `useHasPermission(code)`。
- 登录 / 登出 / refresh 走 `features/auth/*`，不要自己在 UI 里手写 token 操作。

## i18n 规则

- 所有用户可见文案必须使用 i18n key，禁止硬编码。
- 默认 namespace：`common` / `auth` / `errors`；业务模块使用自己的 namespace（例如 `users`）。
- Key 格式：`{namespace}:{section}.{subKey}`（例：`users:list.title`）。
- 新加 key 时 `zh-CN` 与 `en-US` 必须同时更新，类型化 key 会由 `src/lib/i18n/types.d.ts` 自动感知（IDE 补全）。
- 任何 token 不允许进入前端 bundle，仅在后端或 CI secret 中使用。

## 组件规则

- 通用组件放 `src/components/`（`common` / `feedback` / `form` / `data-table` / `layout` / `ui`）
- 用 shadcn CLI 加原子组件：`npx shadcn@latest add <name>`（skill：`add-shadcn-component`）
- 主题变量在 `src/styles/globals.css`，改主题只覆盖 CSS custom properties，勿改组件源码
- Command Palette、UserMenu、Breadcrumb 已经在 `components/layout/` 就绪

## 测试规则

- `src/lib` 的纯逻辑必须有单元测试。
- 共享组件与页面用 React Testing Library + `renderWithProviders` 验证用户可见行为。
- 网络交互使用 MSW，handlers 集中在 `src/mocks/handlers`。
- E2E 只覆盖关键冒烟路径，不替代单元和集成测试。

## 验证规则（必须全部 exit 0 才准合入）

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

涉及登录、路由、mock 或关键页面路径时补：

```bash
pnpm e2e:smoke
```

## 反模式（Do Not）

- 跨层 import（会被 ESLint 打回）
- 把服务端数据放进 Zustand
- 用 `any` 绕过类型；实在无法建模时用 `unknown` 并在边界收窄
- 在前端 bundle 中放真实 token
- 新增 barrel `index.ts`（除非 shadcn/ui 组件约定明确需要）
- 修改 shadcn 生成的组件源码（要定制请建外层包装）
- 硬编码用户可见文案

## 常见任务链路

具体落地步骤在 `docs/ai-coding-guide.md`：

- 新页面
- 新 feature
- 新 i18n key（zh-CN / en-US 同步）
- 用 `npx shadcn@latest add <name>` 装组件
