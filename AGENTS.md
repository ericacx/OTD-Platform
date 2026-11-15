# OTD-Platform 开发约定

OTD 订单交付平台（针织 / 袜业），pnpm monorepo。`产品文档/` 是事实来源：改规则先改文档，代码与文档同一提交。

## 仓库地图

| 路径 | 内容 |
| --- | --- |
| `产品文档/README.md` | 全局统一约定 A–F：模块 M00–M21、节点 N01–N10、闸门 G1/G2、单号、状态、角色。唯一口径 |
| `产品文档/01-需求文档.md` | 需求 F-Mxx-nn（每条标〔视频〕/〔推断〕） |
| `产品文档/02-业务设计.md` | 状态机、主线推导、流程配置、巡检、权限、同步、AI、看板口径、报价计算 |
| `产品文档/03-界面设计.md` | 主题令牌、组件、逐页设计 |
| `产品文档/04-技术方案.md` | 架构、数据模型、接口约定、错误码 |
| `产品文档/原型/otd-prototype.html` | 可点击原型，页面视觉以它为参照 |
| `packages/shared` | 约定落成的代码：MODULES、NODES/GATES、DOC_TYPES、STATUS_MACHINES、PRESET_ROLES、MENU + 权限码 + 预置权限 |
| `packages/contracts` | Zod 契约，每个模块一个文件 `src/<moduleKey>.ts`，前后端共用；错误码用 `defineErrors` 定义在各模块契约文件里 |
| `packages/db` | Drizzle 表结构（按领域分文件 `src/schema/*.ts`）、迁移、种子（`src/seed/reference.ts` 参考数据，`src/seed/demo/*.ts` 演示数据）、`testing.ts` |
| `apps/api` | NestJS 12 + Fastify。`src/core` 横切能力，`src/modules/<moduleKey>` 业务模块 |
| `apps/web` | React 19 + Vite + RR8 + TanStack Query + shadcn/ui（来自 frontend-react-template） |

## 命令

```bash
pnpm install
pnpm --filter @otd/api test          # API 测试（PGlite，内存库）
pnpm --filter @otd/api typecheck
pnpm --filter @otd/web test | typecheck | lint | build
pnpm --filter @otd/api dev           # 默认 DATABASE_URL=pglite:.data/pglite，自动迁移 + 种子
pnpm --filter @otd/web dev           # http://localhost:5173，/api 代理到 3000
pnpm infra:up                        # 可选：docker compose 起 PostgreSQL 18 + Redis 8（端口 55432 / 56379）
```

演示账号密码 `otd2026demo`：管理员 13800000000、业务员王芳 13800000001、业务经理李强 13800000002、总经理李国华 13800000003，其余见 `packages/db/src/seed/reference.ts` 的 `DEMO_USERS`。

## 必须遵守

1. 不写代码注释（机器指令除外）。解释写在提交说明或回复里。
2. 编号、状态名、角色、权限码只用 `packages/shared` 里的定义；新增先改 `产品文档/README.md` 再改 shared。
3. 状态流转用 `canTransition(machine, from, to)` 校验，失败抛 `illegalTransition(from, action)`。不允许 `PATCH status`，状态变化走动作接口 `POST /<资源>/:id/<动作>`，带 `version`，返回 200（`@HttpCode(200)`）。
4. 每个 Controller 方法必须声明 `@Permission(...)`（任一满足即可）、`@Authenticated()` 或 `@Public()`，否则一律 403。
5. 业务单据表带 `ownerId / orgId / customerId`。列表查询必须 `where(and(scoped(table, ctx), ...))`；按 id 取单据用 `assertCanSee(ctx, row)`（看不到返回 404，不区分不存在）。只有客户维度的表用 `customerScoped(column, ctx)`。
6. **事务里只用 `tx`**。PGlite 只有一个连接，在事务里用 `this.db` 会死锁。需要在事务里复用的查询方法加 `db: DbOrTx = this.db` 参数。
7. 写操作：`inTransaction(this.db, this.events, async (tx, emit) => …)`；同一事务里写审计 `this.audit.log(ctx, {...}, tx)`；单号用 `this.numbering.next(docType, tx)`；需要通知其他模块的用 `emit({ type: "<模块>.<对象>.<动作>", ... })`，事件在提交后同步分发。
8. 乐观锁：更新时比较 `version`，不符抛 `versionConflict()`，成功则 `version + 1`。
9. 时间一律用注入的 `Clock`（`clock.now()` / `clock.today()`），不要 `new Date()` 取当前时间；测试用 `createTestApp({ now })` 固定时间。
10. 金额、比率列已是 `number`（numeric mode number）；日期列是 `YYYY-MM-DD` 字符串；时间戳是 `Date`，出接口用 `iso()` 转字符串。
11. 契约只在 `packages/contracts/src/<moduleKey>.ts` 定义：请求 schema（`...Schema`）、响应 DTO 类型、模块错误（`<module>Errors = defineErrors({...})`，抛 `new AppError(errors.X, params)`）。前端直接 import 同一文件。
12. 表结构：只改自己领域的 schema 文件；不要运行 `drizzle-kit generate`（测试库按当前 schema 现生成；迁移在合并时统一重建）。
13. 种子：演示数据写在 `packages/db/src/seed/demo/<领域>.ts`，用 `SeedContext`（`ctx.day(n)` 相对今天、`ctx.docNo(type)`、`ctx.user(phone)`、`ctx.customer(code)`、`ctx.styles[styleNo]`）。客户、款号、人员与原型一致。
14. 每个模块必须有接口测试（`*.test.ts`，用 `createTestApp` + `t.as("sales")` 等角色），至少覆盖：成功路径、状态非法、版本冲突、越权（403）与数据范围（404 / 列表看不到）。
15. 前端：页面放 `apps/web/src/pages/<moduleKey>/`，路由只改自己的 `routes.tsx`；领域逻辑放 `src/features/<moduleKey>/`（keys / queries / mutations / components）；文案放自己的 `src/locales/{zh-CN,en-US}/<moduleKey>.json`；MSW 放 `src/mocks/handlers/<moduleKey>.ts`。状态标签用 `StatusBadge`，不要自己写颜色。

## 参考实现

- 后端横切：`apps/api/src/core/`（access、audit、numbering、events、files、scheduler、ai）
- 后端业务模块样板：`apps/api/src/modules/sampleship/`（单号 + 状态机 + 数据范围 + 事件 + 审计 + 测试）
- 后端配置类样板：`apps/api/src/modules/iam/`（快照 + 回退 + 权限即时生效）
- 前端样板：`apps/web/src/pages/iam/`、`apps/web/src/features/iam/`
