import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { DEFAULT_THEME, type ThemeId } from "@/lib/theme/theme";

export type Locale = "zh-CN" | "en-US";

export type AssistantPreference = { visible: boolean; size: number };

export type PreferencesSnapshot = {
  locale: Locale;
  themeId: ThemeId;
  customPrimary: string | null;
  assistant: AssistantPreference;
};

interface PreferencesState extends PreferencesSnapshot {
  sidebarCollapsed: boolean;
  setLocale: (locale: Locale) => void;
  setTheme: (themeId: ThemeId) => void;
  setCustomPrimary: (color: string | null) => void;
  resetTheme: () => void;
  setAssistant: (patch: Partial<AssistantPreference>) => void;
  toggleSidebar: () => void;
  hydrate: (patch: Partial<PreferencesSnapshot>) => void;
}

export const DEFAULT_PREFERENCES: PreferencesSnapshot = {
  locale: "zh-CN",
  themeId: DEFAULT_THEME,
  customPrimary: null,
  assistant: { visible: true, size: 56 },
};

export const PREFERENCES_STORAGE_KEY = "otd.preferences";

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    immer((set) => ({
      ...DEFAULT_PREFERENCES,
      sidebarCollapsed: false,
      setLocale: (locale) =>
        set((state) => {
          state.locale = locale;
        }),
      setTheme: (themeId) =>
        set((state) => {
          state.themeId = themeId;
        }),
      setCustomPrimary: (color) =>
        set((state) => {
          state.customPrimary = color;
        }),
      resetTheme: () =>
        set((state) => {
          state.themeId = DEFAULT_THEME;
          state.customPrimary = null;
        }),
      setAssistant: (patch) =>
        set((state) => {
          state.assistant = { ...state.assistant, ...patch };
        }),
      toggleSidebar: () =>
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed;
        }),
      hydrate: (patch) =>
        set((state) => {
          Object.assign(state, patch);
        }),
    })),
    {
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        locale: state.locale,
        themeId: state.themeId,
        customPrimary: state.customPrimary,
        assistant: state.assistant,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

export function selectPreferencesSnapshot(state: PreferencesSnapshot): PreferencesSnapshot {
  return {
    locale: state.locale,
    themeId: state.themeId,
    customPrimary: state.customPrimary,
    assistant: state.assistant,
  };
}
