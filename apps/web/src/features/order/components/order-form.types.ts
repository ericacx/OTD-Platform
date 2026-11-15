export type LineValues = {
  styleId: string;
  styleNo: string;
  hint: string;
  color: string;
  size: string;
  sku: string;
  quantity: string;
  unitPrice: string;
};

export const EMPTY_LINE: LineValues = {
  styleId: "",
  styleNo: "",
  hint: "",
  color: "",
  size: "",
  sku: "",
  quantity: "",
  unitPrice: "",
};

export type OrderFormValues = {
  customerId: string;
  poNo: string;
  customerDueDate: string;
  channel: string;
  poType: string;
  productLine: string;
  seasonCode: string;
  styleType: string;
  tradeTerm: string;
  paymentTerms: string;
  currency: string;
  buyerEntity: string;
  origin: string;
  orderDate: string;
  factoryId: string;
  factoryEntity: string;
  transportMode: string;
  destination: string;
  totalUnits: string;
  merchandiserId: string;
  poTerms: string;
  note: string;
  lines: LineValues[];
};

export type OrderLineInput = {
  styleId: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number | null;
};

export function toLineInputs(lines: LineValues[]): OrderLineInput[] {
  return lines.map((l) => ({
    styleId: l.styleId,
    color: l.color || null,
    size: l.size || null,
    sku: l.sku || null,
    quantity: Number(l.quantity),
    unitPrice: l.unitPrice === "" ? null : Number(l.unitPrice),
  }));
}
