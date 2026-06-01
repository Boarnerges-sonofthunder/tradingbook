// ============================================================
// Composant — Fenêtre chat IA flottante pour Analytics
// ============================================================
// Mini-chat flottant déclenché depuis le bouton "Analyse IA"
// de la page Analytics. L'utilisateur peut lancer manuellement
// une première analyse puis poser des questions de suivi.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import type {
  AIAnalyticsFilters,
  AIChatMessage,
  AIConversationState,
  AIMemoryScope,
} from "../../../types/ai";
import {
  askAIAnalytics,
  clearAIConversation,
  loadAIConversation,
} from "../../../services/ai";
import { useUserSettings } from "../../../hooks";
import { tr } from "../../../utils/i18n";
import AIMessageBubble from "./AIMessageBubble";

function getInitialPrompt(language: "fr" | "en") {
  return tr(
    language,
    "Génère un résumé de ma performance actuelle.",
    "Generate a summary of my current performance.",
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null) {
    if (
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      const msg = (error as { message: string }).message.trim();
      if (msg) return msg;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return "Erreur IA inconnue";
}

interface AIAnalyticsFloatingChatProps {
  isOpen: boolean;
  onClose: () => void;
  analyticsFilters?: AIAnalyticsFilters;
  memoryScope?: AIMemoryScope | null;
}

export default function AIAnalyticsFloatingChat({
  isOpen,
  onClose,
  analyticsFilters,
  memoryScope,
}: AIAnalyticsFloatingChatProps) {
  const [conversation, setConversation] = useState<AIConversationState>(() =>
    loadAIConversation(),
  );
  const [inputValue, setInputValue] = useState("");
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const settings = useUserSettings();

  const displayedMessages = useMemo<AIChatMessage[]>(() => {
    if (!streaming || !streamDraft.trim()) return conversation.messages;
    return [
      ...conversation.messages,
      {
        id: "stream-draft",
        role: "assistant",
        content: streamDraft,
        createdAt: new Date().toISOString(),
      },
    ];
  }, [conversation.messages, streaming, streamDraft]);

  // Auto-scroll au dernier message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages.length, streaming]);

  async function submitMessage(rawPrompt?: string): Promise<void> {
    const prompt = (rawPrompt ?? inputValue).trim();
    if (!prompt || pending) return;

    setErrorText(null);
    setPending(true);
    setStreaming(true);
    setStreamDraft("");
    if (!rawPrompt) setInputValue("");

    try {
      await askAIAnalytics({
        userMessage: prompt,
        conversation,
        analyticsFilters,
        memoryScope,
        onToken: (token) => {
          setStreamDraft((prev) => `${prev}${token}`);
        },
      });

      setConversation(loadAIConversation());
    } catch (error) {
      setErrorText(
        `${tr(settings.language, "Chat IA indisponible", "AI chat unavailable")}: ${getErrorMessage(error)}`,
      );
    } finally {
      setPending(false);
      setStreaming(false);
      setStreamDraft("");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  function handleReset() {
    const cleared = clearAIConversation();
    setConversation(cleared);
    setErrorText(null);
  }

  if (!isOpen) return null;

  return (
    <div
      className="ai-float-chat"
      role="dialog"
      aria-modal="true"
      aria-label={tr(settings.language, "Analyse IA", "AI analysis")}
    >
      {/* ── En-tête ── */}
      <header className="ai-float-chat__header">
        <div className="ai-float-chat__header-left">
          <Bot size={16} aria-hidden />
          <span>{tr(settings.language, "Analyse IA", "AI analysis")}</span>
        </div>
        <div className="ai-float-chat__header-actions">
          <button
            type="button"
            className="ai-float-chat__reset"
            onClick={handleReset}
            disabled={pending}
            title={tr(
              settings.language,
              "Réinitialiser la conversation",
              "Reset conversation",
            )}
          >
            {tr(settings.language, "Nouveau", "New")}
          </button>
          <button
            type="button"
            className="ai-float-chat__close"
            onClick={onClose}
            title={tr(settings.language, "Fermer le chat", "Close chat")}
            aria-label={tr(settings.language, "Fermer", "Close")}
          >
            <X size={16} aria-hidden />
            <span>{tr(settings.language, "Fermer", "Close")}</span>
          </button>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="ai-float-chat__messages" role="log" aria-live="polite">
        {displayedMessages.length === 0 && !pending && (
          <div className="ai-float-chat__empty-state">
            <p className="ai-float-chat__empty">
              {tr(
                settings.language,
                "Lancez l'analyse quand vous voulez, puis posez vos questions de suivi.",
                "Start the analysis when you want, then ask follow-up questions.",
              )}
            </p>
            <button
              type="button"
              className="ai-float-chat__launch"
              onClick={() =>
                void submitMessage(getInitialPrompt(settings.language))
              }
            >
              {tr(settings.language, "Lancer l'analyse", "Start analysis")}
            </button>
          </div>
        )}

        {displayedMessages.map((message) => (
          <AIMessageBubble key={message.id} message={message} />
        ))}

        {streaming && (
          <p className="ai-float-chat__streaming">
            {tr(settings.language, "En cours…", "In progress...")}
          </p>
        )}

        {errorText && (
          <p className="ai-float-chat__error" role="alert">
            {errorText}
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Compositeur ── */}
      <div className="ai-float-chat__composer">
        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tr(
            settings.language,
            "Posez une question de suivi… (Entrée pour envoyer)",
            "Ask a follow-up question... (Enter to send)",
          )}
          rows={2}
          disabled={pending}
          aria-label={tr(
            settings.language,
            "Message pour l'IA",
            "Message for AI",
          )}
        />
        <button
          type="button"
          onClick={() => void submitMessage()}
          disabled={pending || !inputValue.trim()}
          className="ai-float-chat__send"
          aria-label={tr(settings.language, "Envoyer", "Send")}
        >
          <Send size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}
