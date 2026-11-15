# 主题与 CSS 变量

## 方案

- Tailwind CSS v4（CSS-only，无 `tailwind.config.js`）
- shadcn/ui `new-york` 风格 + `neutral` 基色
- `light` / `dark` / `system` 三档主题
- 所有色板走 CSS Custom Properties（`--background`、`--foreground`、...）

## 变量清单

`src/styles/globals.css` 定义两套：`:root`（浅色）与 `.dark`（深色）。每套变量对应 shadcn 官方规范：

- 页面：`--background` / `--foreground`
- 卡片：`--card` / `--card-foreground`
- Popover / Dropdown：`--popover` / `--popover-foreground`
- 主色：`--primary` / `--primary-foreground`
- 辅助：`--secondary` / `--secondary-foreground`、`--muted` / `--muted-foreground`、`--accent` / `--accent-foreground`
- 危险：`--destructive` / `--destructive-foreground`
- 表单元件：`--input` / `--ring` / `--border`
- 图表：`--chart-1` ... `--chart-5`
- Sidebar：`--sidebar` / `--sidebar-foreground` 系列
- 圆角：`--radius`（衍生 `--radius-sm / md / lg / xl`）

改主题只需覆盖这些变量；shadcn 组件全部通过 `@theme inline` 映射到 Tailwind 语义色 class（如 `bg-background`、`text-muted-foreground`），无需修改组件源码。

## 切换实现

- `usePreferencesStore.theme: 'light' | 'dark' | 'system'`
- `ThemeProvider`（`src/app/providers/theme-provider.tsx`）监听 store + `prefers-color-scheme`，动态给 `<html>` 挂 `class="dark"`
- 首帧防闪：`index.html` 已经写 `<meta name="color-scheme" content="light dark" />`；若引入 SSR 需额外内联脚本

## 添加 shadcn 组件

模板已经预装 shadcn/ui **全家桶 46 个原子件**（位于 `src/components/ui/`）：

```
表单基础：button · input · label · textarea · select · checkbox · radio-group · switch · toggle · toggle-group · form · input-otp · slider
布局容器：card · separator · scroll-area · aspect-ratio · resizable · sidebar · collapsible · tabs · accordion
弹层浮层：dialog · alert-dialog · sheet · drawer · popover · tooltip · hover-card · dropdown-menu · context-menu · menubar · command
反馈状态：alert · badge · skeleton · progress · sonner
导航展示：breadcrumb · pagination · navigation-menu · avatar · calendar · carousel · chart · table
```

补充新组件用 CLI：

```bash
npx shadcn@latest add <component>
```

组件会落到 `src/components/ui/`。它们默认使用上面的 CSS 变量，无需额外配置。若组件报变量未定义，请对照 shadcn 文档补齐 `globals.css` 里缺失的变量。

**注意**：shadcn CLI 会解析 `tsconfig.json` 的 `paths` 映射；本模板已在根 `tsconfig.json` 里保留 `paths` 供 CLI 使用（`tsconfig.app.json` / `tsconfig.node.json` 仍是实际编译入口）。

## 自定义品牌色

改 `--primary` / `--primary-foreground`（浅色 + 深色两份都要改）即可。可以把颜色转成 OKLCH（更均匀感知）：`https://oklch.com`。

## 图标

统一用 `lucide-react`。size 用 Tailwind class（`size-4`、`size-5`）而不是 svg width/height，保证响应式。
