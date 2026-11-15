import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { setLocaleGetter } from "@/lib/http/interceptors";

import { createLocalBackend, i18nNamespaces, supportedLocales } from "./local-backend";

import type { AppLocale } from "./local-backend";
import type { i18n as I18nInstance, InitOptions } from "i18next";

export type CreateAppI18nOptions = {
  lng?: AppLocale;
  useDetector?: boolean;
};

function createInitOptions(options: CreateAppI18nOptions): InitOptions {
  const initOptions: InitOptions = {
    fallbackLng: "zh-CN",
    supportedLngs: [...supportedLocales],
    ns: [...i18nNamespaces],
    defaultNS: "common",
    fallbackNS: "common",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "otd.locale",
      caches: ["localStorage"],
    },
  };

  if (options.lng) {
    initOptions.lng = options.lng;
  }

  return initOptions;
}

export async function createAppI18n(options: CreateAppI18nOptions = {}): Promise<I18nInstance> {
  const instance = i18next.createInstance();

  if (options.useDetector) {
    instance.use(LanguageDetector);
  }

  instance.use(createLocalBackend());
  instance.use(initReactI18next);

  await instance.init(createInitOptions(options));

  return instance;
}

export const i18n = i18next.createInstance();

setLocaleGetter(() => i18n.language || "zh-CN");

export const i18nReady = (async () => {
  if (typeof window !== "undefined") {
    i18n.use(LanguageDetector);
  }

  i18n.use(createLocalBackend());
  i18n.use(initReactI18next);

  await i18n.init(createInitOptions({}));

  return i18n;
})();
