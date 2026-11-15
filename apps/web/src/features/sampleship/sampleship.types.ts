export type { RecipientDto, SampleShipmentDto } from "@otd/contracts/sampleship";

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ShipmentStatus = "DRAFT" | "SENT" | "SIGNED";
