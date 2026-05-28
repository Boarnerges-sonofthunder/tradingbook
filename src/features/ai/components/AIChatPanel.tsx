import { Send } from "lucide-react";
import type { AIChatMessage } from "../../../types/ai";
import AIMessageBubble from "./AIMessageBubble";

interface AIChatPanelProps {
  messages: AIChatMessage[];
  inputValue: string;
  pending: boolean;
  streaming: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export default function AIChatPanel({
  messages,
  inputValue,
  pending,
  streaming,
  onInputChange,
  onSubmit,
}: AIChatPanelProps) {
  return (
    <section className="ai-chat-panel" aria-label="Panel chat IA">
      <div className="ai-chat-panel__messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="ai-chat-panel__empty">
            Posez une question analytics pour démarrer la review.
          </p>
        )}

        {messages.map((message) => (
          <AIMessageBubble key={message.id} message={message} />
        ))}

        {streaming && (
          <p className="ai-chat-panel__streaming">Réponse IA en streaming...</p>
        )}
      </div>

      <div className="ai-chat-panel__composer">
        <textarea
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ex: Pourquoi mon drawdown augmente cette semaine ?"
          rows={3}
          disabled={pending}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !inputValue.trim()}
          className="ai-chat-panel__send"
        >
          <Send size={16} aria-hidden />
          Envoyer
        </button>
      </div>
    </section>
  );
}
