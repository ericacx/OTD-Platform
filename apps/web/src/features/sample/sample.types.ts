export type {
  LibraryItemDto,
  MaterialDto,
  RoundDto,
  RoundStatus,
  SampleDetailDto,
  SampleSummaryDto,
  StageView,
} from "@otd/contracts/sample";
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
