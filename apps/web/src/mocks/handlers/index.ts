import { assistantHandlers } from "./assistant";
import { authHandlers } from "./auth";
import { capacityHandlers } from "./capacity";
import { documentHandlers } from "./document";
import { factoryauditHandlers } from "./factoryaudit";
import { flowHandlers } from "./flow";
import { iamHandlers } from "./iam";
import { inspectionHandlers } from "./inspection";
import { masterdataHandlers } from "./masterdata";
import { metricsHandlers } from "./metrics";
import { orderHandlers } from "./order";
import { packagingHandlers } from "./packaging";
import { patrolHandlers } from "./patrol";
import { planningHandlers } from "./planning";
import { purchaseHandlers } from "./purchase";
import { quoteHandlers } from "./quote";
import { receivableHandlers } from "./receivable";
import { sampleHandlers } from "./sample";
import { sampleshipHandlers } from "./sampleship";
import { shipmentHandlers } from "./shipment";
import { syncHandlers } from "./sync";
import { testingHandlers } from "./testing";
import { todoHandlers } from "./todo";

export const handlers = [
  ...authHandlers,
  ...todoHandlers,
  ...assistantHandlers,
  ...planningHandlers,
  ...sampleHandlers,
  ...quoteHandlers,
  ...sampleshipHandlers,
  ...testingHandlers,
  ...packagingHandlers,
  ...capacityHandlers,
  ...orderHandlers,
  ...inspectionHandlers,
  ...shipmentHandlers,
  ...receivableHandlers,
  ...purchaseHandlers,
  ...factoryauditHandlers,
  ...documentHandlers,
  ...patrolHandlers,
  ...metricsHandlers,
  ...syncHandlers,
  ...flowHandlers,
  ...masterdataHandlers,
  ...iamHandlers,
];
