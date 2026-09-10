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

function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isUser = message.sender === "user";

  return (
    <div className={`message-item ${isUser ? "message-item--user" : "message-item--bot"}`}>
      <div className="message-item__bubble">
        <p className="message-item__text">{message.message}</p>
        <span className="message-item__timestamp">{formatTimestamp(message.timestamp)}</span>
      </div>
    </div>
  );
}

export default MessageItem;
