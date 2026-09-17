// Derived view types for the dashboard.
//
// Kept separate from types/index.ts on purpose: that file mirrors the wire JSON
// and is deliberately snake_case to match it untransformed. Nothing here
// crosses the network -- these are shapes the frontend computes for itself --
// so they follow normal camelCase and would muddy that rule if mixed in.
import type { Transaction } from "./index";

export type TimeRange = "30d" | "90d" | "6m" | "1y" | "all";
export type Granularity = "daily" | "weekly" | "monthly";
export type ChartMode = "spend" | "inOut";
export type MerchantSort = "spend" | "frequency";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface DashboardFilters {
  range: TimeRange;
  category: string | null;
  merchant: string | null;
}

export interface SummaryStats {
  totalSpent: number;
  totalIncome: number;
  net: number;
  avgDaily: number;
  avgWeekly: number;
  spendCount: number;
  transactionCount: number;
  largestTransaction: Transaction | null;
}

export interface TimeSeriesPoint {
  // ISO date (YYYY-MM-DD) of the bucket's first day -- stable sort/React key.
  bucketStart: string;
  label: string;
  // Both directions live in one point so the spend | in-vs-out toggle is a
  // render choice rather than a recompute.
  spend: number;
  income: number;
}

export interface MerchantTotal {
  merchant: string;
  total: number;
  count: number;
}

export type Cadence = "weekly" | "biweekly" | "monthly";

export interface RecurringSeries {
  merchant: string;
  category: string;
  cadence: Cadence;
  medianGapDays: number;
  averageAmount: number;
  occurrences: number;
  lastDate: string;
  nextExpectedDate: string;
  isIncome: boolean;
  // Average amount normalised to a month, so a weekly $20 charge ranks above a
  // monthly $50 one.
  monthlyAmount: number;
}

export interface Anomaly {
  transaction: Transaction;
  // Which baseline this was judged against -- the transaction's own category,
  // or "all spending" when that category had too few samples to be meaningful.
  baselineLabel: string;
  baselineMedian: number;
  multiple: number;
}

export type CsvColumnRole = "type" | "date" | "amount" | "description" | "ignored";

export interface CsvPreviewColumn {
  name: string;
  role: CsvColumnRole;
  index: number;
}

export interface CsvPreview {
  headerFound: boolean;
  columns: CsvPreviewColumn[];
  // Raw cells exactly as they appear in the file -- never derived or
  // reinterpreted. See utils/csvPreview.ts for why.
  rows: string[][];
  totalDataRows: number;
  fileName: string;
}
