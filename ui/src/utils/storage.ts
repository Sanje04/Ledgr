import type { ChatHistory, Message } from "../types";

const CHAT_HISTORY_KEY = "chatHistory";

export function loadChatHistory(): ChatHistory {
  const raw = localStorage.getItem(CHAT_HISTORY_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMessage);
  } catch {
    return [];
  }
}

export function saveChatHistory(history: ChatHistory): void {
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));
}

export function clearChatHistory(): void {
  localStorage.removeItem(CHAT_HISTORY_KEY);
}

function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.sender === "user" || candidate.sender === "bot") &&
    typeof candidate.message === "string" &&
    typeof candidate.timestamp === "string"
  );
}
