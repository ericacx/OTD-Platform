import type { purchaseCreateSchema, purchaseReceiveSchema } from "@otd/contracts/purchase";
import type { z } from "zod";

export type {
  PurchaseDetailDto,
  PurchaseDto,
  PurchaseLineDto,
  PurchaseMaterialDto,
  PurchaseReceiptDto,
  PurchaseRequirementDto,
} from "@otd/contracts/purchase";
export type { Page } from "@otd/contracts/common";
export type { OrderListItem } from "@otd/contracts/order";

export type PurchaseCreateInput = z.input<typeof purchaseCreateSchema>;
export type PurchaseReceiveInput = z.input<typeof purchaseReceiveSchema>;
export type PurchaseCategory = PurchaseCreateInput["category"];
export const PURCHASE_CATEGORIES = ["YARN", "TRIM", "PACKAGING"] as const;
