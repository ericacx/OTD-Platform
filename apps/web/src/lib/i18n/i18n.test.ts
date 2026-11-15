import { describe, expect, it } from "vitest";

import { createAppI18n } from "./i18n";
import { i18nNamespaces, localResources, moduleNamespaces } from "./local-backend";

describe("app i18n", () => {
  it("uses zh-CN by default and resolves namespaced keys", async () => {
    const instance = await createAppI18n({ lng: "zh-CN" });

    expect(instance.t("wodHc6")).toBe("保存");
    expect(instance.t("Apw3I7", { ns: "auth" })).toBe("欢迎登录");
    expect(instance.t("ROLES_TITLE", { ns: "iam" })).toBe("角色管理");
  });

  it("switches to en-US", async () => {
    const instance = await createAppI18n({ lng: "zh-CN" });

    await instance.changeLanguage("en-US");

    expect(instance.t("ZCYE20")).toBe("Cancel");
    expect(instance.t("BRAND_NAME")).toBe("OTD Delivery Platform");
  });

  it("registers a namespace for every module and keeps zh-CN / en-US aligned", () => {
    expect(moduleNamespaces).toHaveLength(22);
    for (const ns of i18nNamespaces) {
      const zh = Object.keys(localResources["zh-CN"][ns]).sort();
      const en = Object.keys(localResources["en-US"][ns]).sort();
      expect(en, ns).toEqual(zh);
    }
  });
});
