import { useEffect, useRef } from "react";
import type { Message } from "../types";
import MessageItem from "./MessageItem";
import "../styles/MessageList.css";

export interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

function MessageList({ messages, isLoading }: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="message-list">
      {messages.length === 0 && !isLoading && (
        <p className="message-list__empty">Start the conversation by sending a message below.</p>
      )}
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {isLoading && (
        <div className="message-item message-item--bot">
          <div className="message-item__bubble message-item__bubble--loading">
            <span className="loading-dots" aria-label="Loading">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
