import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Env } from "../../core/env.js";
import { ENV } from "../../core/tokens.js";

export type SealedCredential = { v: string; iv: string; tag: string; data: string };

const PARTIAL_KEYS = /^(user(name)?|account|login|client_?id|app_?id)$/i;

export function deriveCredentialKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "otd-sync-credential", "aes-256-gcm", 32));
}

export function sealCredential(plain: Record<string, string>, key: Buffer): SealedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  return { v: "1", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function openCredential(sealed: unknown, key: Buffer): Record<string, string> | null {
  if (!sealed || typeof sealed !== "object") return null;
  const s = sealed as Partial<SealedCredential>;
  if (s.v !== "1" || !s.iv || !s.tag || !s.data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "base64"));
    decipher.setAuthTag(Buffer.from(s.tag, "base64"));
    const text = Buffer.concat([decipher.update(Buffer.from(s.data, "base64")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function maskValue(name: string, value: string): string {
  if (!PARTIAL_KEYS.test(name) || value.length <= 4) return "******";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

export function maskCredential(plain: Record<string, string> | null): Record<string, string> {
  if (!plain) return {};
  return Object.fromEntries(Object.entries(plain).map(([k, v]) => [k, maskValue(k, String(v))]));
}

@Injectable()
export class CredentialVault {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = deriveCredentialKey(env.JWT_SECRET);
  }

  seal(plain: Record<string, string>): SealedCredential {
    return sealCredential(plain, this.key);
  }

  open(sealed: unknown): Record<string, string> | null {
    return openCredential(sealed, this.key);
  }
}
