import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, usePreferencesStore } from "./preferences.store";

describe("usePreferencesStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES, sidebarCollapsed: false });
  });

  it("updates locale", () => {
    usePreferencesStore.getState().setLocale("en-US");
    expect(usePreferencesStore.getState().locale).toBe("en-US");
  });

  it("switches theme and resets custom primary", () => {
    usePreferencesStore.getState().setTheme("night");
    usePreferencesStore.getState().setCustomPrimary("#2563EB");
    expect(usePreferencesStore.getState().themeId).toBe("night");
    usePreferencesStore.getState().resetTheme();
    expect(usePreferencesStore.getState().themeId).toBe("brand-red");
    expect(usePreferencesStore.getState().customPrimary).toBeNull();
  });

  it("hydrates from server preferences and merges assistant settings", () => {
    usePreferencesStore.getState().hydrate({ themeId: "tech-blue" });
    usePreferencesStore.getState().setAssistant({ size: 72 });
    expect(usePreferencesStore.getState().themeId).toBe("tech-blue");
    expect(usePreferencesStore.getState().assistant).toEqual({ visible: true, size: 72 });
  });

  it("toggles the sidebar", () => {
    usePreferencesStore.getState().toggleSidebar();
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true);
  });
});
