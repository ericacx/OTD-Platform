export type {
  FileRefDto,
  HandoverCheckDto,
  HandoverDto,
  HandoverStatus,
  KbDocumentDto,
  KbKind,
} from "@otd/contracts/document";

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
