# 鉴权与权限

## 组成

- `src/lib/auth/token-storage.ts` — token 读写 + 订阅（React `useSyncExternalStore` 用）
- `src/lib/auth/refresh.ts` — 单例锁 + refresh handler 注册中心
- `src/lib/auth/permission.ts` — 纯函数 `hasPermission / hasRole`
- `src/lib/http/refresh-adapter.ts` — 默认 refresh 实现，调用 `/auth/refresh`
- `src/features/auth/` — 领域层：`auth.queries.ts`（session）、`auth.mutations.ts`（login/logout）、`auth.schemas.ts`、`auth.types.ts`、`components/login-form.tsx`
- `src/app/providers/auth-provider.tsx` — Context + `useAuth` hook
- `src/app/router/guards.tsx` — `AuthGuard` / `PermissionGuard` / `RequirePermission` / `RequireRole`

## 登录流程

```
LoginPage
  → useLoginMutation.mutate({ email, password })
    → api.post('/auth/login', { email, password }, { noAuth: true })
      → MSW 或后端返回 { accessToken, refreshToken, expiresAt, user }
    → onSuccess: setTokenInfo() + queryClient.setQueryData(authKeys.session(), user)
  → navigate(redirectPath)
```

## 受保护路由

`src/app/router/index.tsx` 里 `/` 挂 `<AuthGuard/>` 后再往下配置所有页面。AuthGuard 内部：

```
if (isLoading) → <LoadingState/>            // session 加载中
if (!isAuthenticated) → <Navigate to="/login" state={{ from }} />
else → <Outlet/>
```

登录成功后可从 `location.state.from` 拿到原路径，回跳。

## 权限模型

`SessionUser` 上有：

```ts
{
  id: string;
  name: string;
  email: string;
  roles: string[];        // 例如 ['admin']
  permissions: string[];  // 细粒度码，例如 ['user.edit', 'billing.view']
}
```

三种消费方式：

1. **路由级**（`PermissionGuard` 检查 `handle.permissions`）：

   ```tsx
   {
     path: "users",
     handle: { permissions: ["user.view"] },
     element: <PermissionGuard/>,
     children: [...],
   }
   ```

2. **UI 声明式**：

   ```tsx
   <RequirePermission code="user.edit" fallback={<Deny />}>
     <EditButton />
   </RequirePermission>
   ```

3. **Hook**：

   ```tsx
   const canEdit = useHasPermission("user.edit");
   const isAdmin = useHasRole("admin");
   ```

## Refresh Token 单例锁

401 响应触发一次 refresh，失败清 token。多个并发 401 共享同一次 refresh promise，不会打爆后端。

要接入真实后端：

- 修改 `src/lib/http/refresh-adapter.ts` 的 endpoint / body / envelope 解析
- 或改用 `installRefreshHandler(customHandler)` 完全替换

## OIDC / Authentik 骨架

模板不预置具体 IdP。要接入 Authentik / Keycloak / Auth0：

1. `.env.local` 打开 OIDC 变量：

   ```dotenv
   VITE_OIDC_ISSUER=https://idp.example.com
   VITE_OIDC_CLIENT_ID=your-client-id
   VITE_OIDC_REDIRECT_URI=http://localhost:5173/callback
   VITE_OIDC_SCOPES=openid profile email
   ```

2. 在 `src/lib/auth/` 新建 `oidc-adapter.ts` 实现 `authorize / exchangeCode / refresh / logout`
3. 加 `/callback` 路由处理 code exchange，调用 `setTokenInfo`

## 登出

`useLogoutMutation` 会：

- POST `/auth/logout`（best-effort，失败不会阻塞）
- `clearTokenInfo()`（触发 Provider 的 `useSyncExternalStore` 感知）
- 移除所有 `authKeys` query cache

UI 上通常在 `UserMenu → ConfirmDialog → logout → navigate("/login")`。

## 安全边界

- 前端 bundle 里禁止出现 `VITE_*TOKEN*` / `VITE_*SECRET*` / `VITE_*PASSWORD*`，`src/lib/config.ts` 在启动时校验
- Access token 存 localStorage，跨 tab 通过 `storage` 事件同步
- 真正的敏感操作（用户增删、支付等）后端必须再判权，不能只信前端 permission array

## Token 存储风险与建议

模板默认把 access token 放 localStorage。这是 SPA 常见妥协，**权衡**如下：

| 方式                                            | XSS 可读       | CSRF 风险                                | 跨 tab 同步    | 备注                                             |
| ----------------------------------------------- | -------------- | ---------------------------------------- | -------------- | ------------------------------------------------ |
| localStorage（当前默认）                        | ✗ 会被脚本读走 | 无（自定义 header 不参与 CORS 自动携带） | ✓ storage 事件 | 简单可靠，抗 CSRF；但 XSS 一旦发生就完全丢 token |
| sessionStorage                                  | ✗ 同上         | 同上                                     | ✗              | 关标签就没，不适合企业场景                       |
| in-memory                                       | ✓ 不落地       | 无                                       | ✗              | 刷新即掉，需搭配 refresh cookie                  |
| httpOnly cookie（refresh）+ in-memory（access） | ✓              | 需 CSRF token                            | 依赖后端       | 企业首选，需后端配合                             |

**企业生产建议**：

1. 让后端把 refresh token 写入 `Set-Cookie: refresh_token; HttpOnly; Secure; SameSite=Strict`
2. Access token 只放 in-memory（模板改造：把 `token-storage.ts` 的 `writeStorage/readStorage` 替换成模块级 `let`）
3. `/auth/refresh` 请求走 cookie 自动携带，不再需要请求体
4. 若走 cookie，请求需带 CSRF token（可在 `interceptors.ts` 的 request 分支从 meta 读取 CSRF header）

上述改造只影响 `src/lib/auth/token-storage.ts` 和 `refresh-adapter.ts`，业务代码无需改动。

## CSP / SRI

`index.html` 目前未内联 CSP meta。生产环境建议由 nginx / CDN 头下发：

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.example.com; font-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
```

若使用 CDN 引入第三方 JS/CSS，请启用 Subresource Integrity（`<script integrity="sha384-...">`）。
