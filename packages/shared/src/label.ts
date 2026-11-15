export const LOCALES = ["zh-CN", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];

export type Label = { zh: string; en: string };

export function pickLabel(label: Label, locale: string): string {
  return locale.startsWith("en") ? label.en : label.zh;
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
