import type { AIConversationState } from "../../../types/ai";

interface AIConversationHistoryProps {
  conversation: AIConversationState;
  onClear: () => void;
}

export default function AIConversationHistory({
  conversation,
  onClear,
}: AIConversationHistoryProps) {
  return (
    <section className="ai-conversation-history" aria-label="Historique IA">
      <div className="ai-conversation-history__meta">
        <p>
          Conversation locale: <strong>{conversation.id}</strong>
        </p>
        <p>
          Messages: <strong>{conversation.messages.length}</strong>
        </p>
      </div>
      <button
        type="button"
        className="ai-conversation-history__clear"
        onClick={onClear}
      >
        Réinitialiser historique
      </button>
    </section>
  );
}
