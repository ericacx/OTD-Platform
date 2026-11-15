import enAssistant from "@/locales/en-US/assistant.json";
import enAuth from "@/locales/en-US/auth.json";
import enCapacity from "@/locales/en-US/capacity.json";
import enCommon from "@/locales/en-US/common.json";
import enDocument from "@/locales/en-US/document.json";
import enErrors from "@/locales/en-US/errors.json";
import enFactoryaudit from "@/locales/en-US/factoryaudit.json";
import enFlow from "@/locales/en-US/flow.json";
import enIam from "@/locales/en-US/iam.json";
import enInspection from "@/locales/en-US/inspection.json";
import enMasterdata from "@/locales/en-US/masterdata.json";
import enMetrics from "@/locales/en-US/metrics.json";
import enOrder from "@/locales/en-US/order.json";
import enPackaging from "@/locales/en-US/packaging.json";
import enPatrol from "@/locales/en-US/patrol.json";
import enPlanning from "@/locales/en-US/planning.json";
import enPurchase from "@/locales/en-US/purchase.json";
import enQuote from "@/locales/en-US/quote.json";
import enReceivable from "@/locales/en-US/receivable.json";
import enSample from "@/locales/en-US/sample.json";
import enSampleship from "@/locales/en-US/sampleship.json";
import enShipment from "@/locales/en-US/shipment.json";
import enSync from "@/locales/en-US/sync.json";
import enTesting from "@/locales/en-US/testing.json";
import enTodo from "@/locales/en-US/todo.json";
import zhAssistant from "@/locales/zh-CN/assistant.json";
import zhAuth from "@/locales/zh-CN/auth.json";
import zhCapacity from "@/locales/zh-CN/capacity.json";
import zhCommon from "@/locales/zh-CN/common.json";
import zhDocument from "@/locales/zh-CN/document.json";
import zhErrors from "@/locales/zh-CN/errors.json";
import zhFactoryaudit from "@/locales/zh-CN/factoryaudit.json";
import zhFlow from "@/locales/zh-CN/flow.json";
import zhIam from "@/locales/zh-CN/iam.json";
import zhInspection from "@/locales/zh-CN/inspection.json";
import zhMasterdata from "@/locales/zh-CN/masterdata.json";
import zhMetrics from "@/locales/zh-CN/metrics.json";
import zhOrder from "@/locales/zh-CN/order.json";
import zhPackaging from "@/locales/zh-CN/packaging.json";
import zhPatrol from "@/locales/zh-CN/patrol.json";
import zhPlanning from "@/locales/zh-CN/planning.json";
import zhPurchase from "@/locales/zh-CN/purchase.json";
import zhQuote from "@/locales/zh-CN/quote.json";
import zhReceivable from "@/locales/zh-CN/receivable.json";
import zhSample from "@/locales/zh-CN/sample.json";
import zhSampleship from "@/locales/zh-CN/sampleship.json";
import zhShipment from "@/locales/zh-CN/shipment.json";
import zhSync from "@/locales/zh-CN/sync.json";
import zhTesting from "@/locales/zh-CN/testing.json";
import zhTodo from "@/locales/zh-CN/todo.json";

import type { BackendModule, ResourceLanguage } from "i18next";

export const supportedLocales = ["zh-CN", "en-US"] as const;
export const moduleNamespaces = [
  "todo",
  "assistant",
  "planning",
  "sample",
  "quote",
  "sampleship",
  "testing",
  "packaging",
  "capacity",
  "order",
  "inspection",
  "shipment",
  "receivable",
  "purchase",
  "factoryaudit",
  "document",
  "patrol",
  "metrics",
  "sync",
  "flow",
  "masterdata",
  "iam",
] as const;
export const i18nNamespaces = ["common", "auth", "errors", ...moduleNamespaces] as const;

export type AppLocale = (typeof supportedLocales)[number];
export type AppNamespace = (typeof i18nNamespaces)[number];
export type AppResourceMap = Record<AppLocale, Record<AppNamespace, ResourceLanguage>>;

export const localResources = {
  "zh-CN": {
    common: zhCommon,
    auth: zhAuth,
    errors: zhErrors,
    todo: zhTodo,
    assistant: zhAssistant,
    planning: zhPlanning,
    sample: zhSample,
    quote: zhQuote,
    sampleship: zhSampleship,
    testing: zhTesting,
    packaging: zhPackaging,
    capacity: zhCapacity,
    order: zhOrder,
    inspection: zhInspection,
    shipment: zhShipment,
    receivable: zhReceivable,
    purchase: zhPurchase,
    factoryaudit: zhFactoryaudit,
    document: zhDocument,
    patrol: zhPatrol,
    metrics: zhMetrics,
    sync: zhSync,
    flow: zhFlow,
    masterdata: zhMasterdata,
    iam: zhIam,
  },
  "en-US": {
    common: enCommon,
    auth: enAuth,
    errors: enErrors,
    todo: enTodo,
    assistant: enAssistant,
    planning: enPlanning,
    sample: enSample,
    quote: enQuote,
    sampleship: enSampleship,
    testing: enTesting,
    packaging: enPackaging,
    capacity: enCapacity,
    order: enOrder,
    inspection: enInspection,
    shipment: enShipment,
    receivable: enReceivable,
    purchase: enPurchase,
    factoryaudit: enFactoryaudit,
    document: enDocument,
    patrol: enPatrol,
    metrics: enMetrics,
    sync: enSync,
    flow: enFlow,
    masterdata: enMasterdata,
    iam: enIam,
  },
} satisfies AppResourceMap;

function isAppLocale(language: string): language is AppLocale {
  return supportedLocales.includes(language as AppLocale);
}

function isAppNamespace(namespace: string): namespace is AppNamespace {
  return i18nNamespaces.includes(namespace as AppNamespace);
}

export function createLocalBackend(resources: AppResourceMap = localResources): BackendModule {
  return {
    type: "backend",
    init() {},
    read(language, namespace, callback) {
      if (!isAppLocale(language) || !isAppNamespace(namespace)) {
        callback(new Error(`Missing i18n resource: ${language}/${namespace}`), null);
        return;
      }

      callback(null, resources[language][namespace]);
    },
  };
}
