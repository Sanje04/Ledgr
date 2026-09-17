import { useMemo, useRef, useState } from "react";
import AssistantRail from "../components/AssistantRail";
import CategorySpendingChart from "../components/CategorySpendingChart";
import AccountSummary from "../components/AccountSummary";
import AnomaliesCard from "../components/cards/AnomaliesCard";
import KpiRow from "../components/cards/KpiRow";
import RecurringCard from "../components/cards/RecurringCard";
import SpendingTrendCard from "../components/cards/SpendingTrendCard";
import TopMerchantsCard from "../components/cards/TopMerchantsCard";
import TransactionsTableCard from "../components/cards/TransactionsTableCard";
import type { Account, Transaction } from "../types";
import type { TimeRange } from "../types/dashboard";
import {
  TIME_RANGE_LABELS,
  availableRanges,
  dateRangeFor,
  parseTransactionDate,
} from "../utils/dateRange";
import { detectAnomalies, detectRecurring } from "../utils/patterns";
import { OTHER_CATEGORY, getCategorySpendingInRange, getSummaryStats } from "../utils/spending";
import "../styles/DashboardScreen.css";

export interface DashboardScreenProps {
  accounts: Account[];
  /** Ascending by date, as guaranteed by useTransactions. */
  transactions: Transaction[];
  onFileChosen: (file: File) => void;
  isReloading: boolean;
}

/** The backend's hard cap; hitting it exactly means older rows were dropped. */
const API_ROW_LIMIT = 500;

function inRange(txn: Transaction, start: Date, end: Date): boolean {
  const date = parseTransactionDate(txn.date);
  return date >= start && date <= end;
}

function DashboardScreen({
  accounts,
  transactions,
  onFileChosen,
  isReloading,
}: DashboardScreenProps): JSX.Element {
  const [range, setRange] = useState<TimeRange>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [isRailOpen, setIsRailOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ranges = useMemo(() => availableRanges(transactions), [transactions]);
  const dateRange = useMemo(() => dateRangeFor(range, transactions), [range, transactions]);

  // Derived slices. The naming matters: each card is fed the slice that has
  // every filter applied EXCEPT its own dimension.
  //
  // Feeding a card its own filter dimension collapses it to a single entry on
  // the first click, with no way to click back out -- the donut would show one
  // slice, the merchant list one row. The trend chart is the exception: its own
  // dimension is time, which the range pills already own separately, so it
  // takes the fully filtered set.
  const rangeScoped = useMemo(
    () => transactions.filter((txn) => inRange(txn, dateRange.start, dateRange.end)),
    [transactions, dateRange]
  );

  const filtered = useMemo(
    () =>
      rangeScoped.filter(
        (txn) =>
          (category === null || txn.category === category) &&
          (merchant === null || txn.merchant === merchant)
      ),
    [rangeScoped, category, merchant]
  );

  const scopedForCategoryCard = useMemo(
    () => rangeScoped.filter((txn) => merchant === null || txn.merchant === merchant),
    [rangeScoped, merchant]
  );

  const scopedForMerchantCard = useMemo(
    () => rangeScoped.filter((txn) => category === null || txn.category === category),
    [rangeScoped, category]
  );

  const categorySpend = useMemo(
    () => getCategorySpendingInRange(scopedForCategoryCard, dateRange.start, dateRange.end),
    [scopedForCategoryCard, dateRange]
  );

  const filteredStats = useMemo(() => getSummaryStats(filtered, dateRange), [filtered, dateRange]);
  const unfilteredStats = useMemo(
    () => getSummaryStats(rangeScoped, dateRange),
    [rangeScoped, dateRange]
  );

  // Both of these run over the FULL history on purpose, not the range-scoped
  // rows: cadence matching and outlier baselines need more samples than a
  // 30-day window contains. They therefore don't move with the range pills.
  const recurring = useMemo(() => detectRecurring(transactions), [transactions]);
  const anomalies = useMemo(() => detectAnomalies(transactions), [transactions]);
  const anomaliesInRange = useMemo(
    () => anomalies.filter((a) => inRange(a.transaction, dateRange.start, dateRange.end)),
    [anomalies, dateRange]
  );

  const rangeLabel = range === "all" ? "all time" : `last ${TIME_RANGE_LABELS[range].toLowerCase()}`;

  // A bank export has no category column, so db._classify_import_category files
  // essentially everything under "Other" and the donut collapses to one ring.
  // That's a real backend limitation, not a rendering failure -- say so, rather
  // than leaving a card that looks broken.
  const isUncategorized =
    categorySpend.length === 1 && categorySpend[0].category === OTHER_CATEGORY;
  const hasFilters = category !== null || merchant !== null;

  return (
    <div className="dashboard">
      <main className="dashboard__main">
        <div className="dashboard__toolbar">
          <div className="pill-group">
            {ranges.map((option) => (
              <button
                key={option}
                type="button"
                className={`pill${option === range ? " pill--active" : ""}`}
                onClick={() => setRange(option)}
                aria-pressed={option === range}
              >
                {TIME_RANGE_LABELS[option]}
              </button>
            ))}
          </div>

          <div className="dashboard__toolbar-end">
            <AccountSummary accounts={accounts} />
            <button
              type="button"
              className="pill pill--action"
              onClick={() => fileInputRef.current?.click()}
              disabled={isReloading}
            >
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="dashboard__file-input"
              aria-label="Import transactions CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onFileChosen(file);
                }
                event.target.value = "";
              }}
            />
          </div>
        </div>

        {hasFilters && (
          <div className="dashboard__filters">
            <span className="dashboard__filters-label">Filtered</span>
            {category !== null && (
              <button type="button" className="chip" onClick={() => setCategory(null)}>
                {category}
                <span aria-hidden="true">×</span>
              </button>
            )}
            {merchant !== null && (
              <button type="button" className="chip" onClick={() => setMerchant(null)}>
                {merchant}
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        )}

        <KpiRow
          filtered={filteredStats}
          unfiltered={unfilteredStats}
          activeCategory={category}
          activeMerchant={merchant}
        />

        <div className="dashboard__split">
          <SpendingTrendCard transactions={filtered} range={dateRange} />

          <article className="card dashboard__category">
            <h2 className="card__overline">Spending by category</h2>
            <CategorySpendingChart
              data={categorySpend}
              selectedCategory={category}
              onSelectCategory={setCategory}
              rangeLabel={rangeLabel}
            />
            {isUncategorized && (
              <p className="dashboard__category-note">
                Everything here is uncategorized. Bank exports carry no category column, so
                imported transactions are all filed under Other.
              </p>
            )}
          </article>
        </div>

        <div className="dashboard__split">
          <TopMerchantsCard
            transactions={scopedForMerchantCard}
            selectedMerchant={merchant}
            onSelectMerchant={setMerchant}
          />
          <RecurringCard series={recurring} onSelectMerchant={setMerchant} />
        </div>

        <AnomaliesCard anomalies={anomaliesInRange} onSelectMerchant={setMerchant} />

        <TransactionsTableCard
          transactions={filtered}
          isTruncated={transactions.length >= API_ROW_LIMIT}
        />
      </main>

      <AssistantRail
        isOpen={isRailOpen}
        onToggle={() => setIsRailOpen((open) => !open)}
        scopeLabel={`${filtered.length} rows in view`}
      />
    </div>
  );
}

export default DashboardScreen;
