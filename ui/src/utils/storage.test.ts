import { beforeEach, describe, expect, it } from "vitest";
import { clearChatHistory, loadChatHistory, saveChatHistory } from "./storage";
import type { ChatHistory, Message } from "../types";

const CHAT_HISTORY_KEY = "chatHistory";

const sampleMessage: Message = {
  id: "1",
  sender: "user",
  message: "hello",
  timestamp: "2026-01-01T00:00:00.000Z",
};

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty array when nothing is stored", () => {
    expect(loadChatHistory()).toEqual([]);
  });

  it("round-trips a saved history", () => {
    const history: ChatHistory = [sampleMessage];
    saveChatHistory(history);
    expect(loadChatHistory()).toEqual(history);
  });

  it("returns an empty array for corrupted (non-JSON) storage content", () => {
    localStorage.setItem(CHAT_HISTORY_KEY, "not valid json{");
    expect(loadChatHistory()).toEqual([]);
  });

  it("returns an empty array when stored content isn't an array", () => {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ not: "an array" }));
    expect(loadChatHistory()).toEqual([]);
  });

  it("filters out entries that don't match the Message shape", () => {
    localStorage.setItem(
      CHAT_HISTORY_KEY,
      JSON.stringify([sampleMessage, { id: "2" }, { sender: "bot" }, "not an object"])
    );
    expect(loadChatHistory()).toEqual([sampleMessage]);
  });

  it("removes stored history", () => {
    saveChatHistory([sampleMessage]);
    clearChatHistory();
    expect(loadChatHistory()).toEqual([]);
  });
});
