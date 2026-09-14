import type { Message } from "../types";
import "../styles/MessageItem.css";

export interface MessageItemProps {
  message: Message;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BotAvatar(): JSX.Element {
  return (
    <div className="message-item__avatar" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v4M5 10h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
        <circle cx="8.5" cy="15" r="1.25" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15" r="1.25" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isUser = message.sender === "user";

  return (
    <div className={`message-item ${isUser ? "message-item--user" : "message-item--bot"}`}>
      {!isUser && <BotAvatar />}
      <div className="message-item__content">
        <p className="message-item__text">{message.message}</p>
        <span className="message-item__timestamp">{formatTimestamp(message.timestamp)}</span>
      </div>
    </div>
  );
}

export default MessageItem;
