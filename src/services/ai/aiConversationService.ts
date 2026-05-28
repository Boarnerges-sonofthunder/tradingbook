import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { AIChatMessage, AIConversationState } from "../../types/ai";
import {
  AI_RETENTION_DAYS,
  ensureAISandboxFolders,
  getAILogFilePath,
  pruneAIFiles,
} from "./aiSandboxService";

const AI_CONVERSATION_STORAGE_KEY = "tradingbook.ai.conversation.v1";

function createConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getTodayDateText(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getEmptyConversation(): AIConversationState {
  return {
    id: createConversationId(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

export function loadAIConversation(): AIConversationState {
  try {
    const raw = localStorage.getItem(AI_CONVERSATION_STORAGE_KEY);
    if (!raw) return getEmptyConversation();

    const parsed = JSON.parse(raw) as AIConversationState;
    if (!Array.isArray(parsed.messages)) return getEmptyConversation();

    return parsed;
  } catch {
    return getEmptyConversation();
  }
}

export function saveAIConversation(conversation: AIConversationState): void {
  localStorage.setItem(
    AI_CONVERSATION_STORAGE_KEY,
    JSON.stringify({
      ...conversation,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function clearAIConversation(): AIConversationState {
  const empty = getEmptyConversation();
  saveAIConversation(empty);
  return empty;
}

export function createAIMessage(
  role: "user" | "assistant",
  content: string,
  error = false,
): AIChatMessage {
  return {
    id: createMessageId(),
    role,
    content,
    createdAt: new Date().toISOString(),
    error,
  };
}

export async function logAIInteraction(entry: {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  exportPath: string;
  success: boolean;
  error?: string;
}): Promise<string> {
  await ensureAISandboxFolders();
  await pruneAIFiles(AI_RETENTION_DAYS);
  const filename = `ai-chat-${getTodayDateText()}.jsonl`;
  const logPath = await getAILogFilePath(filename);

  await writeTextFile(
    logPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`,
    {
      append: true,
      create: true,
    },
  );

  return logPath;
}
