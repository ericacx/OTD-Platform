# @otd/web

OTD 订单交付平台前端。工程骨架来自 `frontend-react-template`（Vite 8 + React 19 + React Router 8 Data Mode + TanStack Query 5 + shadcn/ui + Tailwind CSS 4 + Zustand + react-i18next + MSW），已对接 `apps/api`（NestJS）。产品口径见仓库根目录 `产品文档/`。

## 命令

```bash
pnpm dev            # http://localhost:5173，/api 代理到 VITE_SERVER_URL（默认 http://localhost:3000）
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test           # Vitest + Testing Library + MSW
pnpm build
pnpm e2e:smoke      # Playwright，MSW 模式；需先 pnpm exec playwright install chromium
```

`VITE_ENABLE_MOCK=true` 时开发服务器用 MSW（`src/mocks/handlers`），否则请求真实 API。开发环境登录页显示演示账号（密码 `otd2026demo`），生产构建需 `VITE_SHOW_DEMO_ACCOUNTS=true` 才显示。

## 结构

| 目录                                                | 说明                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/router/index.tsx`                          | 中央路由：登录 → AuthGuard → AppShell → PermissionGuard → 22 个模块的 `pages/<moduleKey>/routes.tsx`                                                                     |
| `src/app/router/nav-items.ts`                       | 侧边栏由 `@otd/shared` 的 `MENU` 生成，按会话权限过滤                                                                                                                    |
| `src/pages/<moduleKey>/routes.tsx`                  | 每个模块只改自己的路由文件；未实现的菜单叶子用 `placeholderRoutes()`                                                                                                     |
| `src/features/<moduleKey>/`                         | `*.keys.ts / *.queries.ts / *.mutations.ts / *.types.ts / components/`                                                                                                   |
| `src/components/biz/`                               | 业务通用组件：`StatusBadge`、`KpiCard`、`FieldGrid`、`DetailHeaderCard`、`SectionCard`、`ProgressTimeline`、`DocNoLink`、`Money`、`DueLabel`、`FormDialog`、`FileUpload` |
| `src/components/data-table/server-data-table.tsx`   | 服务端分页表格，配合 `useTableQueryState()`（分页 / 排序 / 关键字 / 筛选与 URL 同步）                                                                                    |
| `src/components/common/page-header.tsx`             | 面包屑（来自路由 `handle.breadcrumb`）+ 主色竖条标题 + 操作区                                                                                                            |
| `src/locales/{zh-CN,en-US}/<moduleKey>.json`        | 每个模块一个 namespace，两种语言结构必须一致（测试会校验）                                                                                                               |
| `src/mocks/handlers/<moduleKey>.ts`                 | 每个模块一个 MSW handler 文件                                                                                                                                            |
| `src/lib/theme/theme.ts` + `src/styles/globals.css` | 7 套主题（`data-theme`）+ 自定义主色                                                                                                                                     |

## 约定

- 状态标签一律用 `StatusBadge machine="<状态机>" code={status}`，颜色与文案来自 `@otd/shared`。
- 菜单、权限码、状态名、模块编号只从 `@otd/shared` 取；请求与响应类型只从 `@otd/contracts/<moduleKey>` 取。
- 页面里用 `RequirePermission`（`@/app/router/guards`）控制按钮；features 层不能访问 app 层，需要权限判断时由页面传入。
- 路由叶子用 `leafPath(permission)` / `leafHandle(permission)` 生成路径和 `handle`（权限 + 面包屑）。
- 不写代码注释；用户可见文案走 i18n。
