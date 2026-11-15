import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { supportedLocales, type AppLocale } from "@/lib/i18n/local-backend";

interface LocaleSwitcherProps {
  locale: AppLocale;
  onLocaleChange: (locale: AppLocale) => void;
}

const LOCALE_LABEL_KEY: Record<AppLocale, "LNGZH" | "LNGEN"> = {
  "zh-CN": "LNGZH",
  "en-US": "LNGEN",
};

export function LocaleSwitcher({ locale, onLocaleChange }: LocaleSwitcherProps) {
  const { t } = useTranslation();

  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-foreground hover:bg-muted">
      <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
      <select
        aria-label={t("AUCIIV")}
        className="bg-transparent text-sm outline-none"
        value={locale}
        onChange={(event) => {
          onLocaleChange(event.target.value as AppLocale);
        }}
      >
        {supportedLocales.map((option) => (
          <option key={option} value={option}>
            {t(LOCALE_LABEL_KEY[option])}
          </option>
        ))}
      </select>
    </label>
  );
}
