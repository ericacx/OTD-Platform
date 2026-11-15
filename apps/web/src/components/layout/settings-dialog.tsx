import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { supportedLocales, type AppLocale } from "@/lib/i18n/local-backend";
import { THEME_IDS, THEME_SWATCHES, type ThemeId } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

export type SettingsValue = {
  themeId: ThemeId;
  customPrimary: string | null;
  locale: AppLocale;
  assistant: { visible: boolean; size: number };
};

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: SettingsValue;
  assistantName: string;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomPrimaryChange: (color: string | null) => void;
  onResetTheme: () => void;
  onAssistantChange: (patch: Partial<SettingsValue["assistant"]>) => void;
  onLocaleChange: (locale: AppLocale) => void;
};

const THEME_TEXT = {
  "brand-red": ["THEME_BRAND_RED", "THEME_BRAND_RED_DESC"],
  "tech-blue": ["THEME_TECH_BLUE", "THEME_TECH_BLUE_DESC"],
  "pine-green": ["THEME_PINE_GREEN", "THEME_PINE_GREEN_DESC"],
  "amber-gold": ["THEME_AMBER_GOLD", "THEME_AMBER_GOLD_DESC"],
  "navy-blue": ["THEME_NAVY_BLUE", "THEME_NAVY_BLUE_DESC"],
  "minimal-white": ["THEME_MINIMAL_WHITE", "THEME_MINIMAL_WHITE_DESC"],
  night: ["THEME_NIGHT", "THEME_NIGHT_DESC"],
} as const;

function ThemePreview({ id }: { id: ThemeId }) {
  const s = THEME_SWATCHES[id];
  return (
    <div
      aria-hidden="true"
      className="flex h-14 overflow-hidden rounded-md border border-border"
      style={{ background: s.surface }}
    >
      <div
        className="w-5"
        style={{
          background: `linear-gradient(180deg, ${s.sidebarFrom}, ${s.sidebarTo})`,
          borderRight: id === "minimal-white" ? "1px solid #E5E7EB" : undefined,
        }}
      />
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="h-1.5 w-2/3 rounded" style={{ background: s.dark ? "#262A33" : "#E5E7EB" }} />
        <div className="h-1.5 w-1/2 rounded" style={{ background: s.dark ? "#262A33" : "#E5E7EB" }} />
        <div className="mt-auto h-2 w-1/3 self-end rounded" style={{ background: s.primary }} />
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  value,
  assistantName,
  onThemeChange,
  onCustomPrimaryChange,
  onResetTheme,
  onAssistantChange,
  onLocaleChange,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("SET_TITLE")}</DialogTitle>
        </DialogHeader>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("SET_THEME")}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {THEME_IDS.map((id) => {
              const selected = value.themeId === id;
              const [nameKey, descKey] = THEME_TEXT[id];
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "relative rounded-lg border p-2 text-left transition-colors hover:border-primary/60",
                    selected ? "border-primary ring-2 ring-primary-soft" : "border-border",
                  )}
                  key={id}
                  type="button"
                  onClick={() => onThemeChange(id)}
                >
                  <ThemePreview id={id} />
                  <p className="mt-2 text-sm font-medium">{t(nameKey)}</p>
                  <p className="text-xs text-muted-foreground">{t(descKey)}</p>
                  {selected ? (
                    <span className="absolute top-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                aria-label={t("SET_CUSTOM")}
                className="size-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                type="color"
                value={value.customPrimary ?? THEME_SWATCHES[value.themeId].primary}
                onChange={(event) => onCustomPrimaryChange(event.target.value.toUpperCase())}
              />
              {t("SET_CUSTOM")}
            </label>
            <Button size="sm" type="button" variant="outline" onClick={onResetTheme}>
              {t("SET_RESET")}
            </Button>
          </div>
        </section>
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{assistantName}</h3>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="assistant-visible">{t("SET_ASSISTANT_VISIBLE")}</Label>
            <Switch
              checked={value.assistant.visible}
              id="assistant-visible"
              onCheckedChange={(visible) => onAssistantChange({ visible })}
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="w-16 text-sm text-muted-foreground">{t("SET_ASSISTANT_SIZE")}</span>
            <Slider
              aria-label={t("SET_ASSISTANT_SIZE")}
              className="flex-1"
              max={96}
              min={40}
              step={4}
              value={[value.assistant.size]}
              onValueChange={([size]) => size !== undefined && onAssistantChange({ size })}
            />
            <span className="tabular w-10 text-right text-sm">{value.assistant.size}</span>
          </div>
        </section>
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t("AUCIIV")}</h3>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {supportedLocales.map((locale) => (
              <Button
                className={cn("h-8", value.locale === locale && "bg-primary-soft text-primary")}
                key={locale}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => onLocaleChange(locale)}
              >
                {t(locale === "zh-CN" ? "LNGZH" : "LNGEN")}
              </Button>
            ))}
          </div>
        </section>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("SET_DONE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
