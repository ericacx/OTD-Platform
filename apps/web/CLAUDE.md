# Claude Code Guidelines

## 当前状态

本仓库是 React 前端模板的 Core 实现，已完成第二轮工程化修复。六条工程化命令全绿，是修改代码的基线。任何修改前先读 `AGENTS.md`、`README.md`、`docs/ai-coding-guide.md` 与 `docs/architecture/*.md`。

## 工作方式

- 回答和文档使用中文。
- 所有判断必须基于事实和本仓库文件。
- 需求不清时先问，不要猜。
- 发现更优路径时主动说明理由。

## 实现规则

- 新代码必须 TypeScript strict。
- 用户可见文案必须走 i18n key（`useTranslation()`），禁硬编码。
- 服务端数据必须使用 TanStack Query；Zustand 只放 UI 状态和偏好。
- 请求层必须显式导入 `import { api } from "@/lib/http/client"`。
- 浏览器运行时不得读取真实密钥；`VITE_*TOKEN/SECRET/PASSWORD` 一律被 `config.ts` 拒绝。
- 不允许为了方便破坏目录依赖方向（ESLint 会打回）。
- 不允许存在欺骗性代码——如果某个模块没被消费就不要留 dead export；文档描述必须与实际实现一致。

## 目录规则

- `src/app`：应用启动、Provider、Router、ErrorBoundary。
- `src/pages`：页面组装点，路由 lazy 挂载。
- `src/features`：领域逻辑（queries / mutations / schemas / keys / 领域组件）。
- `src/components`：无业务通用组件。
- `src/lib`：无业务基础库。
- `src/stores`：Zustand UI 状态。

## 验证规则

常规修改至少运行：

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

涉及登录、路由、mock 或关键页面路径时，还必须运行：

```bash
pnpm e2e:smoke
```

## 常见任务链路

具体落地步骤在 `docs/ai-coding-guide.md`：

- 新页面
- 新 feature
- 新 i18n key（zh-CN / en-US 同步）
- 用 `npx shadcn@latest add <name>` 装组件

## 反模式（明确禁止）

- 跨层 import
- 把服务端数据放进 Zustand
- 用 `any` 绕过类型
- 前端 bundle 中放真实 token
- 新增 barrel export（除非 shadcn/ui 约定明确需要）
- 硬编码用户可见文案
- 修改 shadcn 生成的组件源码
