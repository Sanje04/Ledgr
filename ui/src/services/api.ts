import { USE_MOCK_DATA, missingBackendError } from "../constants";
import type { ApiRequest, ApiResponse } from "../types";

// The real backend endpoint. Unset is an error, not a cue to mock -- see
// USE_MOCK_DATA in ../constants.
const API_URL = import.meta.env.VITE_API_URL as string | undefined;

const MOCK_REPLIES: readonly string[] = [
  "I'm running in mock mode right now — no backend is connected yet.",
  "That's interesting! Once the real API is wired up, I'll give a proper answer.",
  "Got it. (This is a placeholder reply from the local mock.)",
];

function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageToMock(message: string): Promise<string> {
  await mockDelay(600 + Math.random() * 600);
  const reply = MOCK_REPLIES[message.length % MOCK_REPLIES.length];
  return `${reply}\n\nYou said: "${message}"`;
}

async function sendMessageToRealApi(message: string): Promise<string> {
  const body: ApiRequest = { message };

  let response: Response;
  try {
    response = await fetch(API_URL as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Error: Unable to get response. Please try again.");
  }

  if (!response.ok) {
    throw new Error("Error: Unable to get response. Please try again.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Error: Unable to get response. Please try again.");
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as ApiResponse).response !== "string"
  ) {
    throw new Error("Error: Unable to get response. Please try again.");
  }

  return (data as ApiResponse).response;
}

export async function sendMessageToAPI(message: string): Promise<string> {
  if (USE_MOCK_DATA) {
    return sendMessageToMock(message);
  }
  if (!API_URL) {
    throw missingBackendError("VITE_API_URL");
  }
  return sendMessageToRealApi(message);
}
