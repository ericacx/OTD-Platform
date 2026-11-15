import { useEffect } from "react";

import { applyThemeToElement } from "@/lib/theme/theme";
import { usePreferencesStore } from "@/stores/preferences.store";

import type { PropsWithChildren } from "react";

export function ThemeProvider({ children }: PropsWithChildren) {
  const themeId = usePreferencesStore((state) => state.themeId);
  const customPrimary = usePreferencesStore((state) => state.customPrimary);

  useEffect(() => {
    applyThemeToElement(document.documentElement, { themeId, customPrimary });
  }, [themeId, customPrimary]);

  return children;
}
