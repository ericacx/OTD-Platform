import { preferencesSchema } from "@otd/contracts/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { AssistantFab } from "@/components/layout/assistant-fab";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { useUpdatePreferencesMutation } from "@/features/auth/auth.mutations";
import { ChangePasswordDialog } from "@/features/auth/components/change-password-dialog";
import { supportedLocales, type AppLocale } from "@/lib/i18n/local-backend";
import { isHexColor, isThemeId } from "@/lib/theme/theme";
import { selectPreferencesSnapshot, usePreferencesStore, type PreferencesSnapshot } from "@/stores/preferences.store";

import { CommandPaletteContainer } from "./command-palette-container";
import { buildNavItems } from "./nav-items";

function isSupportedLocale(locale: string): locale is AppLocale {
  return supportedLocales.includes(locale as AppLocale);
}

function fromServer(raw: Record<string, unknown>, locale: string): Partial<PreferencesSnapshot> {
  const parsed = preferencesSchema.safeParse(raw);
  const patch: Partial<PreferencesSnapshot> = {};
  if (parsed.success) {
    if (isThemeId(parsed.data.themeId)) patch.themeId = parsed.data.themeId;
    if (parsed.data.customPrimary === null || isHexColor(parsed.data.customPrimary))
      patch.customPrimary = parsed.data.customPrimary ?? null;
    if (parsed.data.assistant?.visible !== undefined && parsed.data.assistant.size !== undefined) {
      patch.assistant = { visible: parsed.data.assistant.visible, size: parsed.data.assistant.size };
    }
  }
  if (isSupportedLocale(locale)) patch.locale = locale;
  return patch;
}

export function AppShellRoute() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const prefs = usePreferencesStore();
  const updatePreferences = useUpdatePreferencesMutation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const hydratedFor = useRef<string | null>(null);
  const lastSynced = useRef<string>("");

  useEffect(() => {
    if (!user || hydratedFor.current === user.id) return;
    hydratedFor.current = user.id;
    const patch = fromServer(user.preferences, user.locale);
    usePreferencesStore.getState().hydrate(patch);
    if (patch.locale && patch.locale !== i18n.language) void i18n.changeLanguage(patch.locale);
    lastSynced.current = JSON.stringify(selectPreferencesSnapshot(usePreferencesStore.getState()));
  }, [user, i18n]);

  const snapshot = JSON.stringify(selectPreferencesSnapshot(prefs));
  const { mutate } = updatePreferences;
  useEffect(() => {
    if (!user || hydratedFor.current !== user.id || snapshot === lastSynced.current) return;
    const timer = window.setTimeout(() => {
      const value = JSON.parse(snapshot) as PreferencesSnapshot;
      lastSynced.current = snapshot;
      mutate({
        themeId: value.themeId,
        customPrimary: value.customPrimary,
        locale: value.locale,
        assistant: value.assistant,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [snapshot, user, mutate]);

  const mustChange = Boolean(user?.mustChangePassword);
  const navItems = useMemo(
    () => buildNavItems(user?.permissions ?? [], i18n.language),
    [user?.permissions, i18n.language],
  );
  const assistantVisible = prefs.assistant.visible && Boolean(user?.permissions.includes("assistant.chat.use"));

  const changeLocale = (next: AppLocale) => {
    prefs.setLocale(next);
    void i18n.changeLanguage(next);
  };

  const shellUser = user ? { name: user.name, subtitle: user.roleNames.join(" / ") || user.orgName } : null;

  return (
    <AppShell
      collapsed={prefs.sidebarCollapsed}
      commandSlot={<CommandPaletteContainer navItems={navItems} />}
      locale={isSupportedLocale(i18n.language) ? i18n.language : prefs.locale}
      mobileNavOpen={mobileNavOpen}
      navItems={navItems}
      overlay={
        <>
          {assistantVisible ? (
            <AssistantFab label={t("ASSISTANT_NAME")} size={prefs.assistant.size} to="/assistant" />
          ) : null}
          <SettingsDialog
            assistantName={t("ASSISTANT_NAME")}
            open={settingsOpen}
            value={{
              themeId: prefs.themeId,
              customPrimary: prefs.customPrimary,
              locale: isSupportedLocale(i18n.language) ? i18n.language : prefs.locale,
              assistant: prefs.assistant,
            }}
            onAssistantChange={prefs.setAssistant}
            onCustomPrimaryChange={prefs.setCustomPrimary}
            onLocaleChange={changeLocale}
            onOpenChange={setSettingsOpen}
            onResetTheme={prefs.resetTheme}
            onThemeChange={prefs.setTheme}
          />
          <ChangePasswordDialog forced={mustChange} open={passwordOpen || mustChange} onOpenChange={setPasswordOpen} />
        </>
      }
      user={shellUser}
      onChangePassword={() => setPasswordOpen(true)}
      onLocaleChange={changeLocale}
      onMobileNavChange={setMobileNavOpen}
      onOpenSettings={() => setSettingsOpen(true)}
      onSearch={(keyword) => void navigate(`/orders?keyword=${encodeURIComponent(keyword)}`)}
      onSignOut={async () => {
        await logout();
        void navigate("/login", { replace: true });
      }}
      onToggleSidebar={prefs.toggleSidebar}
    />
  );
}
