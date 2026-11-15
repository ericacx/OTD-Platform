import { AuthModule } from "./auth/auth.module.js";
import { IamModule } from "./iam/iam.module.js";
import { MasterDataModule } from "./masterdata/masterdata.module.js";
import { TodoModule } from "./todo/todo.module.js";
import { AssistantModule } from "./assistant/assistant.module.js";
import { PlanningModule } from "./planning/planning.module.js";
import { SampleModule } from "./sample/sample.module.js";
import { QuoteModule } from "./quote/quote.module.js";
import { SampleShipModule } from "./sampleship/sampleship.module.js";
import { TestingModule } from "./testing/testing.module.js";
import { PackagingModule } from "./packaging/packaging.module.js";
import { CapacityModule } from "./capacity/capacity.module.js";
import { OrderModule } from "./order/order.module.js";
import { InspectionModule } from "./inspection/inspection.module.js";
import { ShipmentModule } from "./shipment/shipment.module.js";
import { ReceivableModule } from "./receivable/receivable.module.js";
import { PurchaseModule } from "./purchase/purchase.module.js";
import { FactoryAuditModule } from "./factoryaudit/factoryaudit.module.js";
import { DocumentModule } from "./document/document.module.js";
import { PatrolModule } from "./patrol/patrol.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { SyncModule } from "./sync/sync.module.js";
import { FlowModule } from "./flow/flow.module.js";
import { MainlineModule } from "./mainline/mainline.module.js";
import { NotificationModule } from "./notification/notification.module.js";

export const FEATURE_MODULES = [
  AuthModule,
  IamModule,
  MasterDataModule,
  TodoModule,
  AssistantModule,
  PlanningModule,
  SampleModule,
  QuoteModule,
  SampleShipModule,
  TestingModule,
  PackagingModule,
  CapacityModule,
  OrderModule,
  InspectionModule,
  ShipmentModule,
  ReceivableModule,
  PurchaseModule,
  FactoryAuditModule,
  DocumentModule,
  PatrolModule,
  MetricsModule,
  SyncModule,
  FlowModule,
  MainlineModule,
  NotificationModule,
];
