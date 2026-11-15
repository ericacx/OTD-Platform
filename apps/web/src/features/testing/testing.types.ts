export type {
  ReuseCheckResultDto,
  ReuseMatchDto,
  TestReportDto,
  TestRequestDetailDto,
  TestRequestDto,
} from "@otd/contracts/testing";
export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };
