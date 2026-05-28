import type { AIChatMessage } from "../../../types/ai";

interface AIMessageBubbleProps {
  message: AIChatMessage;
}

export default function AIMessageBubble({ message }: AIMessageBubbleProps) {
  const isUser = message.role === "user";
  const roleLabel = isUser ? "Vous" : "IA";

  return (
    <article
      className={`ai-message-bubble ${isUser ? "ai-message-bubble--user" : "ai-message-bubble--assistant"} ${message.error ? "ai-message-bubble--error" : ""}`}
    >
      <header className="ai-message-bubble__header">
        <span className="ai-message-bubble__role">{roleLabel}</span>
        <time className="ai-message-bubble__time">
          {new Date(message.createdAt).toLocaleTimeString()}
        </time>
      </header>
      <p className="ai-message-bubble__content">{message.content}</p>
    </article>
  );
}
