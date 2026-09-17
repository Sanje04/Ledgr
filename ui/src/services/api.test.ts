import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_API_URL = "http://example.test/api/chat";

describe("sendMessageToAPI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a mock reply when mock mode is explicitly enabled", async () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_USE_MOCK_DATA", "true");
    const { sendMessageToAPI } = await import("./api");

    const reply = await sendMessageToAPI("hi there");

    expect(typeof reply).toBe("string");
    expect(reply).toContain("hi there");
  });

  // The regression that matters: an unset URL used to mock silently, so a
  // misconfigured deploy served placeholder replies instead of failing.
  it("throws rather than mocking when no URL is set and mock mode is off", async () => {
    vi.stubEnv("VITE_API_URL", "");
    const { sendMessageToAPI } = await import("./api");

    await expect(sendMessageToAPI("hi")).rejects.toThrow(/No backend configured/);
  });

  it("throws a friendly error when fetch itself rejects (network failure)", async () => {
    vi.stubEnv("VITE_API_URL", REAL_API_URL);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { sendMessageToAPI } = await import("./api");

    await expect(sendMessageToAPI("hi")).rejects.toThrow(
      "Error: Unable to get response. Please try again."
    );
  });

  it("throws a friendly error on a non-OK response", async () => {
    vi.stubEnv("VITE_API_URL", REAL_API_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false } as unknown as Response)
    );
    const { sendMessageToAPI } = await import("./api");

    await expect(sendMessageToAPI("hi")).rejects.toThrow(
      "Error: Unable to get response. Please try again."
    );
  });

  it("throws a friendly error when the response body isn't valid JSON", async () => {
    vi.stubEnv("VITE_API_URL", REAL_API_URL);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("bad json")),
      } as unknown as Response)
    );
    const { sendMessageToAPI } = await import("./api");

    await expect(sendMessageToAPI("hi")).rejects.toThrow(
      "Error: Unable to get response. Please try again."
    );
  });
});
