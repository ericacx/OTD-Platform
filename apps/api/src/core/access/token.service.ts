import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import type { Env } from "../env.js";
import { ENV } from "../tokens.js";

export type AccessClaims = { sub: string; sid: string };

@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async signAccess(userId: string, sessionId: string, now: Date): Promise<{ token: string; expiresAt: number }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.env.ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt(iat).setExpirationTime(exp).setIssuer("otd").sign(this.key);
    return { token, expiresAt: exp * 1000 };
  }

  async verifyAccess(token: string, now: Date): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: "otd", currentDate: now });
      if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
      return { sub: payload.sub, sid: payload.sid };
    } catch {
      return null;
    }
  }

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashToken(token) };
  }

  refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
