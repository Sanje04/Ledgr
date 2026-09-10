import { useEffect, useState } from "react";
import type { Message } from "../types";
import { loadChatHistory, saveChatHistory } from "../utils/storage";
import { sendMessageToAPI } from "../services/api";
import MessageList from "./MessageList";
import InputField from "./InputField";
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
        <h1>AI Chatbot</h1>
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
