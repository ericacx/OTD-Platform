# 本地开发

## 环境

- Node `^20.19.0 || >=22.12.0`（`.nvmrc` 已锁）
- pnpm ≥ 10.29.1（`packageManager` 已锁）
- 推荐编辑器：VS Code / WebStorm，开启 ESLint + Prettier 自动 fix

## 起步

```bash
corepack enable
corepack prepare pnpm@10.29.1 --activate
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开 http://localhost:5173。默认 `.env.example` 打开了 MSW mock，登录用 `admin@example.com / password` 即可。

## 开启/关闭 mock

- `.env.local` 里设 `VITE_ENABLE_MOCK=true` 或 `false`
- MSW 只在 DEV 构建里存在；生产 bundle 已剔除

## 常用命令

| 命令                                                   | 用途                                   |
| ------------------------------------------------------ | -------------------------------------- |
| `pnpm dev`                                             | Vite dev server (5173)                 |
| `pnpm build`                                           | 生产构建                               |
| `pnpm preview`                                         | 预览生产产物 (4173)                    |
| `pnpm analyze`                                         | 生成 bundle 分析报告 `dist/stats.html` |
| `pnpm typecheck`                                       | TS project references 全量检查         |
| `pnpm lint` / `pnpm lint:fix`                          | ESLint                                 |
| `pnpm format` / `pnpm format:check`                    | Prettier                               |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` | Vitest                                 |
| `pnpm e2e:smoke`                                       | Playwright 冒烟                        |
| `pnpm commit`                                          | commitizen 交互提交                    |

## 目录导航

- 找页面：`src/pages/<name>/<name>.page.tsx`
- 找业务逻辑：`src/features/<domain>/*`
- 找库层：`src/lib/*`
- 找 mock：`src/mocks/handlers/<domain>.ts`
- 找样式：`src/styles/globals.css`
- 找 i18n 文案：`src/locales/<lng>/<ns>.json`

## Git hooks

- Pre-commit：lint-staged（ESLint --fix + Prettier）
- Commit-msg：commitlint
- Pre-push：typecheck + test

首次 clone 后 `pnpm install` 会自动挂 hooks（`prepare` 脚本触发）。

## 常见问题

**Q：为什么 `pnpm test` 之前会崩？**
A：旧脚本包含 `NODE_OPTIONS=--no-experimental-webstorage`，Node 不识别该 flag。已移除，直接 `vitest run`。

**Q：MSW 请求打不到？**
A：确认 `.env.local` 里 `VITE_ENABLE_MOCK=true`；`main.tsx` 里的 dev-only guard 需要 dev server；生产构建不再有 MSW。

**Q：新加的 i18n key IDE 没补全？**
A：`src/lib/i18n/types.d.ts` 通过 module augmentation 依赖 zh-CN JSON。改完 JSON 后可能需要 `TS Server` 重启（VS Code：Cmd+Shift+P → Restart TS Server）。

**Q：`pnpm add` 后 build 变大？**
A：跑 `pnpm analyze` 看 `dist/stats.html`。若新库很重，考虑：动态 import、拆到独立 chunk（`vite.config.ts` 的 `VENDOR_GROUPS`）、评估是否真的需要。
