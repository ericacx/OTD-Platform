import { Toaster } from "@/components/ui/sonner";
import { THEME_SWATCHES } from "@/lib/theme/theme";
import { usePreferencesStore } from "@/stores/preferences.store";

import type { PropsWithChildren } from "react";

export function ToastProvider({ children }: PropsWithChildren) {
  const themeId = usePreferencesStore((state) => state.themeId);

  return (
    <>
      {children}
      <Toaster closeButton position="top-right" richColors theme={THEME_SWATCHES[themeId].dark ? "dark" : "light"} />
    </>
  );
}
