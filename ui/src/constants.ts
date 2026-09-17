// Keep in sync with ChatRequest.message max_length in backend/main.py.
export const MAX_MESSAGE_LENGTH = 4000;

// Mock mode is opt-in, and deliberately NOT inferred from "VITE_API_URL
// happens to be unset". As a silent fallback it meant a misconfigured deploy
// rendered three plausible fake accounts and a placeholder bot reply instead
// of failing visibly -- a demo that looks like it works is worse than one
// that shows an error. Declared here rather than read in both services so the
// two can't disagree about whether mock mode is on.
export const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === "true";

if (USE_MOCK_DATA) {
  // Once per page load, not per request.
  console.warn(
    "[Tender] Mock mode is ON (VITE_USE_MOCK_DATA=true) — accounts, transactions " +
      "and assistant replies are all fake. Unset it to talk to a real backend."
  );
}

// Shared by both services: no backend configured, and no explicit opt-in to
// mocks either. Names both ways out rather than just reporting the symptom.
export function missingBackendError(envVar: string): Error {
  return new Error(
    `Error: No backend configured. Set ${envVar} to your backend URL, ` +
      "or VITE_USE_MOCK_DATA=true to run against built-in sample data."
  );
}
