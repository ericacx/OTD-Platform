import { Inject, Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import type { LoginInput, LoginResult, PreferencesDto, SessionUser, TokenDto } from "@otd/contracts/auth";
import { commonErrors } from "@otd/contracts/errors";
import { type Database, orgs, refreshTokens, roles, userRoles, users, uuidv7 } from "@otd/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { AccessService } from "../../core/access/access.service.js";
import type { AccessContext } from "../../core/access/access.types.js";
import { TokenService, hashToken } from "../../core/access/token.service.js";
import { AuditService, type RequestMeta } from "../../core/audit.service.js";
import { Clock } from "../../core/clock.js";
import { AppError, notFound } from "../../core/errors.js";
import { DB } from "../../core/tokens.js";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async login(input: LoginInput, meta: RequestMeta & { device?: string }): Promise<LoginResult> {
    const now = this.clock.now();
    const user = (await this.db.select().from(users).where(eq(users.phone, input.phone)))[0];
    if (!user) {
      await this.audit.log(null, { action: "auth.login_failed", objectType: "user", diff: { phone: input.phone } }, this.db, meta);
      throw new AppError(commonErrors.AUTH_INVALID_CREDENTIALS);
    }
    if (user.status !== "ACTIVE") throw new AppError(commonErrors.AUTH_ACCOUNT_DISABLED);
    if (user.lockedUntil && user.lockedUntil > now) throw new AppError(commonErrors.AUTH_ACCOUNT_LOCKED, { unlockAt: user.lockedUntil.toISOString() });
    const ok = await verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lockedUntil = failed >= MAX_FAILED ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
      await this.db.update(users).set({ failedLogins: lockedUntil ? 0 : failed, lockedUntil }).where(eq(users.id, user.id));
      await this.audit.log(null, { action: "auth.login_failed", objectType: "user", objectId: user.id, diff: { failed } }, this.db, meta);
      if (lockedUntil) throw new AppError(commonErrors.AUTH_ACCOUNT_LOCKED, { unlockAt: lockedUntil.toISOString() });
      throw new AppError(commonErrors.AUTH_INVALID_CREDENTIALS);
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
    const token = await this.issue(user.id, uuidv7(), meta);
    const session = await this.session(user.id);
    await this.audit.log(null, { action: "auth.login", objectType: "user", objectId: user.id }, this.db, meta);
    return { ...token, user: session };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenDto> {
    const now = this.clock.now();
    const row = (await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hashToken(refreshToken))))[0];
    if (!row || row.revokedAt || row.expiresAt <= now) throw new AppError(commonErrors.AUTH_REFRESH_INVALID);
    if (row.rotatedAt) {
      await this.db.update(refreshTokens).set({ revokedAt: now }).where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      await this.audit.log(null, { action: "auth.refresh_reuse_detected", objectType: "user", objectId: row.userId }, this.db, meta);
      throw new AppError(commonErrors.AUTH_REFRESH_INVALID);
    }
    const ctx = await this.access.load(row.userId);
    if (!ctx) throw new AppError(commonErrors.AUTH_ACCOUNT_DISABLED);
    await this.db.update(refreshTokens).set({ rotatedAt: now }).where(eq(refreshTokens.id, row.id));
    return this.issue(row.userId, row.familyId, { ...meta, device: row.device ?? undefined });
  }

  async logout(ctx: AccessContext): Promise<void> {
    if (ctx.sessionId) {
      await this.db.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.familyId, ctx.sessionId), isNull(refreshTokens.revokedAt)));
    }
    await this.audit.log(ctx, { action: "auth.logout", objectType: "user", objectId: ctx.userId });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    this.access.invalidate(userId);
  }

  async session(userId: string): Promise<SessionUser> {
    const ctx = await this.access.load(userId);
    const user = (await this.db.select().from(users).where(eq(users.id, userId)))[0];
    if (!ctx || !user) throw notFound();
    const org = (await this.db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, user.primaryOrgId)))[0];
    const roleRows = await this.db.select({ code: roles.code, name: roles.name }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId));
    return {
      id: user.id,
      name: user.name,
      nameEn: user.nameEn,
      phone: user.phone,
      email: user.email,
      orgId: user.primaryOrgId,
      orgName: org?.name ?? "",
      roles: roleRows.map((r) => r.code),
      roleNames: roleRows.map((r) => r.name),
      permissions: [...ctx.permissions].sort(),
      dataScope: ctx.dataScope.mode,
      allCustomers: ctx.customerScope.mode === "ALL",
      customerIds: ctx.customerScope.mode === "LIST" ? ctx.customerScope.customerIds : [],
      locale: user.locale,
      preferences: user.preferences,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async updatePreferences(ctx: AccessContext, prefs: PreferencesDto): Promise<SessionUser> {
    const user = (await this.db.select().from(users).where(eq(users.id, ctx.userId)))[0]!;
    const merged = { ...user.preferences, ...prefs };
    await this.db
      .update(users)
      .set({ preferences: merged, ...(prefs.locale ? { locale: prefs.locale } : {}) })
      .where(eq(users.id, ctx.userId));
    this.access.invalidate(ctx.userId);
    return this.session(ctx.userId);
  }

  async changePassword(ctx: AccessContext, oldPassword: string, newPassword: string): Promise<void> {
    const user = (await this.db.select().from(users).where(eq(users.id, ctx.userId)))[0]!;
    if (!(await verify(user.passwordHash, oldPassword).catch(() => false))) throw new AppError(commonErrors.AUTH_INVALID_CREDENTIALS);
    await this.db.update(users).set({ passwordHash: await hash(newPassword), mustChangePassword: false }).where(eq(users.id, ctx.userId));
    await this.db.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.userId, ctx.userId), isNull(refreshTokens.revokedAt)));
    await this.audit.log(ctx, { action: "auth.password_changed", objectType: "user", objectId: ctx.userId });
  }

  async devices(ctx: AccessContext) {
    const now = this.clock.now();
    const rows = await this.db.select().from(refreshTokens).where(and(eq(refreshTokens.userId, ctx.userId), isNull(refreshTokens.revokedAt), isNull(refreshTokens.rotatedAt))).orderBy(desc(refreshTokens.createdAt));
    return rows
      .filter((r) => r.expiresAt > now)
      .map((r) => ({ id: r.familyId, device: r.device, ip: r.ip, createdAt: r.createdAt.toISOString(), current: r.familyId === ctx.sessionId }));
  }

  async revokeDevice(ctx: AccessContext, familyId: string): Promise<void> {
    await this.db.update(refreshTokens).set({ revokedAt: this.clock.now() }).where(and(eq(refreshTokens.userId, ctx.userId), eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private async issue(userId: string, familyId: string, meta: RequestMeta & { device?: string }): Promise<TokenDto> {
    const now = this.clock.now();
    const access = await this.tokens.signAccess(userId, familyId, now);
    const refresh = this.tokens.newRefreshToken();
    await this.db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: refresh.hash,
      expiresAt: new Date(now.getTime() + this.tokens.refreshTtlMs()),
      device: meta.device ?? meta.userAgent?.slice(0, 200) ?? null,
      ip: meta.ip ?? null,
    });
    return { accessToken: access.token, refreshToken: refresh.token, expiresAt: access.expiresAt };
  }
}
