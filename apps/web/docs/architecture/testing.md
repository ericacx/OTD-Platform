# 测试策略

## 分层

```
Vitest 单元      lib/、hooks、纯组件逻辑
Vitest + RTL     pages、feature 组件，走 MSW
Playwright       关键 smoke 路径（登录 → 主页 → 一个 CRUD）
```

## 命令

- `pnpm test` — 一次性跑所有 vitest 用例
- `pnpm test:watch` — watch 模式
- `pnpm test:coverage` — v8 coverage 报告
- `pnpm e2e:smoke` — 起 dev + MSW，跑 `e2e/smoke.spec.ts`

## 单元与集成

- 全局 setup：`src/test/setup.ts`
  - jest-dom matchers
  - JSDOM localStorage / matchMedia polyfill
  - MSW `server.listen({ onUnhandledRequest: "error" })` — 任何未 mock 的请求 fail
- 页面测试统一用 `renderWithProviders`：

  ```ts
  const { router } = await renderWithProviders({ route: "/users" });
  expect(await screen.findByRole("heading", { name: "用户列表" })).toBeInTheDocument();
  ```

  `renderWithProviders` 内部按 App 一样组装 `i18n / QueryClient / AuthProvider / Router`，测试环境自动切 `zh-CN`。

## MSW

- Handlers 在 `src/mocks/handlers/` 按 domain 组织，`index.ts` 汇总
- 每个 handler 返回完整 envelope（`errcode: '0'`）
- 需要模拟 401、404、5xx 时在测试里用 `server.use(...)` 覆盖
- Session mock 默认返回 `demoSession`（`admin` 角色 + 一组 permission）

## Playwright

- 配置：`playwright.config.ts`
  - 用 dev server + `VITE_ENABLE_MOCK=true`（因为 MSW 只在 DEV mode 编入 bundle）
  - `reuseExistingServer: !CI` — 本地已经跑 dev 就复用
  - 需要 CI 时会自动 retry × 2
- Spec 只覆盖用户视角的关键路径，别把单元测试搬进来

## 覆盖率

- `pnpm test:coverage` 用 v8 provider；结果输出到 `coverage/`
- 目标：
  - `src/lib/` ≥ 80% line coverage
  - `src/features/` ≥ 60%
  - `src/components/`：核心组件（DataTable / Form）≥ 70%，layout ≥ 40%
- 不追求 100%，写"能失败的测试"比追覆盖率数字更重要
