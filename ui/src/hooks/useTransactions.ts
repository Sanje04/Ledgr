import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTransactions } from "../services/transactions";
import type { Account, Transaction } from "../types";
import { parseTransactionDate } from "../utils/dateRange";

export type TransactionsStatus = "loading" | "ready" | "error";

export interface UseTransactionsResult {
  accounts: Account[];
  /** Sorted ASCENDING by date -- see the note on sorting below. */
  transactions: Transaction[];
  /**
   * The outcome of the last *completed* fetch, not "is a request in flight".
   * Keeping these separate is what stops a retry from momentarily leaving the
   * error state and flashing a different screen underneath it.
   */
  status: TransactionsStatus;
  isFetching: boolean;
  error: string | null;
  /**
   * False until the first fetch resolves either way. Lets a post-import reload
   * keep the current screen on screen instead of blanking back to a spinner.
   */
  hasLoadedOnce: boolean;
  reload: () => Promise<void>;
}

/**
 * Owns the single fetch of GET /api/transactions and everything derived from
 * its lifecycle. Called once, in App.tsx.
 *
 * The payload arrives newest-first (backend/db.py sorts `date: -1`) but every
 * aggregate downstream wants oldest-first -- time-series buckets, the median
 * gap in recurring detection, running comparisons. Sorting once here, rather
 * than defensively inside each consumer, means there's one place to get it
 * right and no repeated sorts of the same 500 rows. Consumers can treat
 * "ascending by date" as a precondition.
 */
export function useTransactions(): UseTransactionsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<TransactionsStatus>("loading");
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Guards against a slow first fetch resolving after the component unmounts,
  // and against an out-of-order reload overwriting newer data.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    // `status` deliberately isn't reset here -- it keeps describing the last
    // completed fetch until this one finishes.
    setIsFetching(true);

    try {
      const data = await fetchTransactions();
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }
      setAccounts(data.accounts);
      setTransactions(
        [...data.transactions].sort(
          (a, b) => parseTransactionDate(a.date).getTime() - parseTransactionDate(b.date).getTime()
        )
      );
      setError(null);
      setStatus("ready");
    } catch (err) {
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }
      setError(err instanceof Error ? err.message : "Error: Unable to load transactions.");
      setStatus("error");
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setIsFetching(false);
        setHasLoadedOnce(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { accounts, transactions, status, isFetching, error, hasLoadedOnce, reload: load };
}
