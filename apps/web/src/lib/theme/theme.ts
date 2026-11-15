export const THEME_IDS = [
  "brand-red",
  "tech-blue",
  "pine-green",
  "amber-gold",
  "navy-blue",
  "minimal-white",
  "night",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "brand-red";

export type ThemeSwatch = {
  id: ThemeId;
  primary: string;
  sidebarFrom: string;
  sidebarTo: string;
  surface: string;
  dark: boolean;
};

export const THEME_SWATCHES: Record<ThemeId, ThemeSwatch> = {
  "brand-red": {
    id: "brand-red",
    primary: "#B5121B",
    sidebarFrom: "#3A1418",
    sidebarTo: "#5A1F24",
    surface: "#F3F4F6",
    dark: false,
  },
  "tech-blue": {
    id: "tech-blue",
    primary: "#2563EB",
    sidebarFrom: "#101B33",
    sidebarTo: "#1B2D55",
    surface: "#F3F4F6",
    dark: false,
  },
  "pine-green": {
    id: "pine-green",
    primary: "#2F8F5B",
    sidebarFrom: "#10241A",
    sidebarTo: "#1C3A2A",
    surface: "#F3F4F6",
    dark: false,
  },
  "amber-gold": {
    id: "amber-gold",
    primary: "#A87A1E",
    sidebarFrom: "#2A2112",
    sidebarTo: "#43341A",
    surface: "#F3F4F6",
    dark: false,
  },
  "navy-blue": {
    id: "navy-blue",
    primary: "#2C4A7A",
    sidebarFrom: "#121C30",
    sidebarTo: "#1F2F4D",
    surface: "#F3F4F6",
    dark: false,
  },
  "minimal-white": {
    id: "minimal-white",
    primary: "#C8102E",
    sidebarFrom: "#FFFFFF",
    sidebarTo: "#FFFFFF",
    surface: "#FAFAFA",
    dark: false,
  },
  night: {
    id: "night",
    primary: "#E5484D",
    sidebarFrom: "#0B0D11",
    sidebarTo: "#12151B",
    surface: "#0F1115",
    dark: true,
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

export function mixColor(hex: string, target: string, weight: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  return toHex([a[0] + (b[0] - a[0]) * weight, a[1] + (b[1] - a[1]) * weight, a[2] + (b[2] - a[2]) * weight]);
}

export function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function derivePrimaryVars(primary: string, dark: boolean): Record<string, string> {
  const foreground = relativeLuminance(primary) > 0.45 ? "#111827" : "#FFFFFF";
  return {
    "--primary": primary,
    "--primary-foreground": foreground,
    "--primary-hover": mixColor(primary, "#000000", 0.12),
    "--primary-soft": dark ? mixColor(primary, "#171A21", 0.78) : mixColor(primary, "#FFFFFF", 0.9),
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": foreground,
  };
}

export const CUSTOM_VAR_NAMES = Object.keys(derivePrimaryVars("#000000", false));

export type ThemeApplyInput = { themeId: ThemeId; customPrimary: string | null };

export function applyThemeToElement(element: HTMLElement, input: ThemeApplyInput) {
  const swatch = THEME_SWATCHES[input.themeId];
  element.dataset.theme = input.themeId;
  element.classList.toggle("dark", swatch.dark);
  element.style.colorScheme = swatch.dark ? "dark" : "light";
  for (const name of CUSTOM_VAR_NAMES) element.style.removeProperty(name);
  if (input.customPrimary && isHexColor(input.customPrimary)) {
    for (const [name, value] of Object.entries(derivePrimaryVars(input.customPrimary, swatch.dark))) {
      element.style.setProperty(name, value);
    }
  }
}
