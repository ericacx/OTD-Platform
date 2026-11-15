export type {
  CostCategory,
  CostItemDto,
  QuoteCheckDto,
  QuoteDto,
  QuoteExportForm,
  QuoteListItemDto,
  QuotePreviewDto,
  QuoteRoundDto,
  QuoteRoundKind,
  QuoteRoundStatus,
  QuoteStrategyDto,
  StrategyParams,
  StyleOptionDto,
} from "@otd/contracts/quote";

export type PageOf<T> = { items: T[]; total: number; page: number; pageSize: number };

export type CostItemInput = {
  category: "YARN" | "LABOR" | "TRIMS" | "OTHER";
  name: string;
  spec?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number;
};

export type QuotePreviewInput = {
  quoteId: string;
  quantity: number;
  strategyId?: string;
  priceCny?: number;
};
