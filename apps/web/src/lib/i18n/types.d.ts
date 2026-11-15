import "i18next";

import type assistant from "@/locales/zh-CN/assistant.json";
import type auth from "@/locales/zh-CN/auth.json";
import type capacity from "@/locales/zh-CN/capacity.json";
import type common from "@/locales/zh-CN/common.json";
import type document from "@/locales/zh-CN/document.json";
import type errors from "@/locales/zh-CN/errors.json";
import type factoryaudit from "@/locales/zh-CN/factoryaudit.json";
import type flow from "@/locales/zh-CN/flow.json";
import type iam from "@/locales/zh-CN/iam.json";
import type inspection from "@/locales/zh-CN/inspection.json";
import type masterdata from "@/locales/zh-CN/masterdata.json";
import type metrics from "@/locales/zh-CN/metrics.json";
import type order from "@/locales/zh-CN/order.json";
import type packaging from "@/locales/zh-CN/packaging.json";
import type patrol from "@/locales/zh-CN/patrol.json";
import type planning from "@/locales/zh-CN/planning.json";
import type purchase from "@/locales/zh-CN/purchase.json";
import type quote from "@/locales/zh-CN/quote.json";
import type receivable from "@/locales/zh-CN/receivable.json";
import type sample from "@/locales/zh-CN/sample.json";
import type sampleship from "@/locales/zh-CN/sampleship.json";
import type shipment from "@/locales/zh-CN/shipment.json";
import type sync from "@/locales/zh-CN/sync.json";
import type testing from "@/locales/zh-CN/testing.json";
import type todo from "@/locales/zh-CN/todo.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      auth: typeof auth;
      errors: typeof errors;
      todo: typeof todo;
      assistant: typeof assistant;
      planning: typeof planning;
      sample: typeof sample;
      quote: typeof quote;
      sampleship: typeof sampleship;
      testing: typeof testing;
      packaging: typeof packaging;
      capacity: typeof capacity;
      order: typeof order;
      inspection: typeof inspection;
      shipment: typeof shipment;
      receivable: typeof receivable;
      purchase: typeof purchase;
      factoryaudit: typeof factoryaudit;
      document: typeof document;
      patrol: typeof patrol;
      metrics: typeof metrics;
      sync: typeof sync;
      flow: typeof flow;
      masterdata: typeof masterdata;
      iam: typeof iam;
    };
  }
}
