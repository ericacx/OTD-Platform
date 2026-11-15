# 规范

## 命名

| 类别              | 规则                           | 示例                          |
| ----------------- | ------------------------------ | ----------------------------- |
| 目录、文件        | kebab-case                     | `user-edit-form.tsx`          |
| React 组件        | PascalCase，文件名与组件名对齐 | `UserEditForm`                |
| Hook              | `useXxx`                       | `useAuth`、`useHasPermission` |
| Zustand store     | `useXxxStore`                  | `usePreferencesStore`         |
| Zod schema        | `xxxSchema`                    | `userSchema`                  |
| Query key factory | `xxxKeys`                      | `usersKeys`                   |
| 常量              | UPPER_SNAKE_CASE               | `MAX_REFRESH_RETRIES`         |
| 页面              | `xxx.page.tsx`                 | `users/index.page.tsx`        |
| 路由文件          | `xxx.route.ts`                 | `users/users.route.ts`        |
| 环境变量          | `VITE_XXX_YYY`                 | `VITE_API_BASE_URL`           |

## 路径别名

只允许 `@/*` → `src/*`。相对路径只用于同级或子目录（`./foo`, `./sub/bar`），不允许 `../..` 向上跨层。

## 目录约束（ESLint 强制）

见 [`overview.md`](./overview.md#分层)。任何一层试图 import 上层都会 lint 报错。

## 禁止事项

- 服务端数据放 Zustand（用 TanStack Query）
- 用 `any`（用 `unknown` 或收窄类型；实在无法建模时局部 `as unknown as X` 并注明理由）
- 硬编码用户可见文案（使用 i18n key，key 格式 `namespace:section.subKey`）
- Barrel export `index.ts`（`components/ui/` 内部除外 —— shadcn 生成的组件遵循原生约定）
- 修改 `.env.example` 时写入真实 token/secret
- 修改 `wise-webui-monorepo` 的历史目录哲学

## 提交与分支

- Conventional Commits，`commitlint.config.cjs` 强制
- Scope 由项目自定；默认允许 `app / auth / users / lib / ui / docs / test / ci / chore`
- 分支：`feat/<scope>-<slug>`、`fix/<scope>-<slug>`、`chore/xxx`、`refactor/xxx`
- 使用 `pnpm commit` 走 commitizen 交互提交

## Pre-commit / Pre-push

- `pre-commit`：`pnpm lint-staged`（对暂存文件 eslint --fix + prettier）
- `commit-msg`：`pnpm commitlint --edit`
- `pre-push`：`pnpm typecheck && pnpm test`

Hooks 由 husky 9 管理。第一次 clone 后 `pnpm install` 会通过 `prepare` 脚本自动装 hooks。

## 环境变量

- `.env`：默认值，进仓库
- `.env.local`：本地覆盖，`.gitignore`
- `.env.example`：模板，只写占位符，**不允许真实 token**
- `src/lib/config.ts` 校验 env：任何 `VITE_*TOKEN*` / `VITE_*SECRET*` / `VITE_*PASSWORD*` 变量会在启动时抛错
- 真实 token 必须走后端代理 或 CI secret 注入，不进入前端 bundle

## 依赖新增

- UI 库首选 shadcn CLI：`npx shadcn@latest add <component>`。别 npm 直接装它的 npm 包版本。
- Node 依赖用 `pnpm add`。共享代码请评估能不能只放 `lib/` 里（无 React 依赖），方便未来抽包。
- 每次 `pnpm add` 后跑 `pnpm typecheck` 与 `pnpm build`，看新依赖对分包/包体积的影响。
