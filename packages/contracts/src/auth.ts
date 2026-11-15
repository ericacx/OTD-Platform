import { z } from "zod";

export const loginInputSchema = z.object({
  phone: z.string().trim().regex(/^1\d{10}$/),
  password: z.string().min(1).max(128),
  device: z.string().max(200).optional(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshInputSchema = z.object({ refreshToken: z.string().min(10) });

export const tokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
});
export type TokenDto = z.infer<typeof tokenSchema>;

export const dataScopeSchema = z.enum(["SELF", "ORG", "ORG_AND_CHILDREN", "ALL"]);

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: z.string().nullable().optional(),
  phone: z.string(),
  email: z.string().nullable().optional(),
  avatarUrl: z.string().optional(),
  orgId: z.string(),
  orgName: z.string(),
  roles: z.array(z.string()).default([]),
  roleNames: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  dataScope: dataScopeSchema,
  allCustomers: z.boolean(),
  customerIds: z.array(z.string()).default([]),
  locale: z.string(),
  preferences: z.record(z.string(), z.unknown()).default({}),
  mustChangePassword: z.boolean().default(false),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const loginResultSchema = tokenSchema.extend({ user: sessionUserSchema });
export type LoginResult = z.infer<typeof loginResultSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
});

export const preferencesSchema = z.object({
  themeId: z.enum(["brand-red", "tech-blue", "pine-green", "amber-gold", "navy-blue", "minimal-white", "night"]).optional(),
  customPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  locale: z.enum(["zh-CN", "en-US"]).optional(),
  assistant: z.object({ visible: z.boolean(), size: z.number().int().min(40).max(96) }).partial().optional(),
});
export type PreferencesDto = z.infer<typeof preferencesSchema>;

export const sessionDeviceSchema = z.object({ id: z.string(), device: z.string().nullable(), ip: z.string().nullable(), createdAt: z.string(), current: z.boolean() });
