import { useEffect, useState } from "react";
import type { Message } from "../types";
import { loadChatHistory, saveChatHistory } from "../utils/storage";
import { sendMessageToAPI } from "../services/api";
import MessageList from "./MessageList";
import InputField from "./InputField";
import "../styles/AssistantRail.css";

export interface AssistantRailProps {
  isOpen: boolean;
  onToggle: () => void;
  /** How much data the dashboard is currently showing, e.g. "142 rows in view". */
  scopeLabel: string;
}

const SUGGESTIONS = [
  "How much did I spend on dining last month?",
  "What's my biggest recurring expense?",
  "Show me everything over $200",
  "Which merchant did I visit most?",
];

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AssistantRail({ isOpen, onToggle, scopeLabel }: AssistantRailProps): JSX.Element {
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

  function send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || isLoading) {
      return;
    }

    appendMessage({
      id: createId(),
      sender: "user",
      message: trimmed,
      timestamp: new Date().toISOString(),
    });
    setInputValue("");
    void requestBotReply(trimmed);
  }

  function handleRetry(): void {
    if (!lastFailedMessage || isLoading) {
      return;
    }
    void requestBotReply(lastFailedMessage);
  }

  if (!isOpen) {
    return (
      <aside className="assistant-rail assistant-rail--closed">
        <button
          type="button"
          className="assistant-rail__reopen"
          onClick={onToggle}
          aria-label="Open assistant"
          aria-expanded={false}
        >
          <span className="assistant-rail__avatar" aria-hidden="true">
            <AssistantGlyph />
          </span>
          <span className="assistant-rail__reopen-label">Assistant</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="assistant-rail">
      <div className="assistant-rail__header">
        <span className="assistant-rail__avatar" aria-hidden="true">
          <AssistantGlyph />
        </span>
        <span className="assistant-rail__title">Assistant</span>
        <span className="assistant-rail__scope">{scopeLabel}</span>
        <button
          type="button"
          className="assistant-rail__collapse"
          onClick={onToggle}
          aria-label="Collapse assistant"
          aria-expanded
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="assistant-rail__empty">
          <p>
            Ask about the transactions you've loaded. Answers come from your own data, through
            the assistant's tools.
          </p>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="assistant-rail__suggestion"
              onClick={() => send(suggestion)}
              disabled={isLoading}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : (
        <MessageList messages={messages} isLoading={isLoading} />
      )}

      {error && (
        <div className="assistant-rail__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={handleRetry} disabled={isLoading}>
            Retry
          </button>
        </div>
      )}

      <InputField
        value={inputValue}
        onChange={setInputValue}
        onSend={() => send(inputValue)}
        disabled={isLoading}
      />
    </aside>
  );
}

function AssistantGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.8L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  );
}

export default AssistantRail;
