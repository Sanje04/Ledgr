import { useEffect, useState } from "react";
import type { Message } from "../types";
import { loadChatHistory, saveChatHistory } from "../utils/storage";
import { sendMessageToAPI } from "../services/api";
import MessageList from "./MessageList";
import InputField from "./InputField";
import ThemeToggle from "./ThemeToggle";
import "../styles/ChatWindow.css";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ChatWindow(): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessages(loadChatHistory());
  }, []);

  function appendMessage(message: Message): void {
    setMessages((prev) => {
      const next = [...prev, message];
      saveChatHistory(next);
      return next;
    });
  }

  async function requestBotReply(text: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const reply = await sendMessageToAPI(text);
      appendMessage({
        id: createId(),
        sender: "bot",
        message: reply,
        timestamp: new Date().toISOString(),
      });
      setLastFailedMessage(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error: Unable to get response. Please try again."
      );
      setLastFailedMessage(text);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSend(): void {
    const text = inputValue.trim();
    if (!text || isLoading) {
      return;
    }

    appendMessage({
      id: createId(),
      sender: "user",
      message: text,
      timestamp: new Date().toISOString(),
    });
    setInputValue("");
    void requestBotReply(text);
  }

  function handleRetry(): void {
    if (!lastFailedMessage || isLoading) {
      return;
    }
    void requestBotReply(lastFailedMessage);
  }

  return (
    <div className="chat-window">
      <header className="chat-window__header">
        <div className="chat-window__brand">
          <span className="chat-window__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M5 10h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
              <circle cx="8.5" cy="15" r="1.25" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="15" r="1.25" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h1>LEDGR - AI Banking Assistant</h1>
        </div>
        <ThemeToggle />
      </header>

      <MessageList messages={messages} isLoading={isLoading} />

      {error && (
        <div className="chat-window__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleRetry} disabled={isLoading}>
            Retry
          </button>
        </div>
      )}

      <InputField
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        disabled={isLoading}
      />
    </div>
  );
}

export default ChatWindow;
