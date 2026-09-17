import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_TRANSACTIONS_API_URL = "http://example.test/api/transactions";

describe("fetchTransactions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns mock data when mock mode is explicitly enabled", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", "");
    vi.stubEnv("VITE_USE_MOCK_DATA", "true");
    const { fetchTransactions } = await import("./transactions");

    const data = await fetchTransactions();

    expect(data.accounts.length).toBeGreaterThan(0);
    expect(data.transactions.length).toBeGreaterThan(0);
  });

  // The regression that matters: an unset URL used to mock silently, so a
  // misconfigured deploy rendered plausible fake accounts instead of failing.
  it("throws rather than mocking when no URL is set and mock mode is off", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", "");
    const { fetchTransactions } = await import("./transactions");

    await expect(fetchTransactions()).rejects.toThrow(/No backend configured/);
  });

  it("throws a friendly error when fetch itself rejects (network failure)", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", REAL_TRANSACTIONS_API_URL);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { fetchTransactions } = await import("./transactions");

    await expect(fetchTransactions()).rejects.toThrow(
      "Error: Unable to load transactions. Please try again."
    );
  });

  it("throws a friendly error on a non-OK response", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", REAL_TRANSACTIONS_API_URL);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false } as unknown as Response));
    const { fetchTransactions } = await import("./transactions");

    await expect(fetchTransactions()).rejects.toThrow(
      "Error: Unable to load transactions. Please try again."
    );
  });

  it("throws a friendly error when the response body isn't valid JSON", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", REAL_TRANSACTIONS_API_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("bad json")),
      } as unknown as Response)
    );
    const { fetchTransactions } = await import("./transactions");

    await expect(fetchTransactions()).rejects.toThrow(
      "Error: Unable to load transactions. Please try again."
    );
  });

  it("throws a friendly error when the response shape is unexpected", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", REAL_TRANSACTIONS_API_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ unexpected: true }),
      } as unknown as Response)
    );
    const { fetchTransactions } = await import("./transactions");

    await expect(fetchTransactions()).rejects.toThrow(
      "Error: Unable to load transactions. Please try again."
    );
  });

  it("returns parsed data on a valid response", async () => {
    vi.stubEnv("VITE_TRANSACTIONS_API_URL", REAL_TRANSACTIONS_API_URL);
    const payload = { accounts: [], transactions: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      } as unknown as Response)
    );
    const { fetchTransactions } = await import("./transactions");

    const data = await fetchTransactions();

    expect(data).toEqual(payload);
  });
});
