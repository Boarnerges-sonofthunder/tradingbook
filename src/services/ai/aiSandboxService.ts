import { exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppLocalDataDir, getFolderPath } from "../filesystem";

const AI_EXPORTS_FOLDER = "ai_exports";
const AI_LOGS_SUBFOLDER = "ai";
export const AI_RETENTION_DAYS = 7;

function parseDateFromExportFilename(filename: string): Date | null {
  const match = /^analytics-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(
    filename,
  );
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  return new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
  );
}

function parseDateFromLogFilename(filename: string): Date | null {
  const match = /^ai-chat-(\d{4})-(\d{2})-(\d{2})\.jsonl$/.exec(filename);
  if (!match) return null;

  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59);
}

function isOlderThanRetention(date: Date, retentionDays: number): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return date.getTime() < cutoffMs;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function isInside(basePath: string, candidatePath: string): boolean {
  const base = normalizePath(basePath).replace(/\/+$/, "");
  const candidate = normalizePath(candidatePath);
  return candidate === base || candidate.startsWith(`${base}/`);
}

export async function getAIExportsFolderPath(): Promise<string> {
  const baseDir = await getAppLocalDataDir();
  return join(baseDir, AI_EXPORTS_FOLDER);
}

export async function getAILogsFolderPath(): Promise<string> {
  const logsRoot = await getFolderPath("logs");
  return join(logsRoot, AI_LOGS_SUBFOLDER);
}

export async function getAIExportFilePath(filename: string): Promise<string> {
  const exportsDir = await getAIExportsFolderPath();
  return join(exportsDir, filename);
}

export async function getAILogFilePath(filename: string): Promise<string> {
  const logsDir = await getAILogsFolderPath();
  return join(logsDir, filename);
}

export async function ensureAISandboxFolders(): Promise<void> {
  const [exportsPath, logsPath] = await Promise.all([
    getAIExportsFolderPath(),
    getAILogsFolderPath(),
  ]);

  if (!(await exists(exportsPath))) {
    await mkdir(exportsPath, { recursive: true });
  }

  if (!(await exists(logsPath))) {
    await mkdir(logsPath, { recursive: true });
  }
}

export async function pruneAIFiles(retentionDays = AI_RETENTION_DAYS): Promise<void> {
  if (retentionDays <= 0) return;

  await ensureAISandboxFolders();
  const [exportsPath, logsPath] = await Promise.all([
    getAIExportsFolderPath(),
    getAILogsFolderPath(),
  ]);

  const [exportEntries, logEntries] = await Promise.all([
    readDir(exportsPath),
    readDir(logsPath),
  ]);

  await Promise.all(
    exportEntries.map(async (entry) => {
      if (!entry.isFile) return;
      if (entry.name === "latest-analytics.json") return;
      const parsed = parseDateFromExportFilename(entry.name);
      if (!parsed || !isOlderThanRetention(parsed, retentionDays)) return;
      await remove(await getAIExportFilePath(entry.name));
    }),
  );

  await Promise.all(
    logEntries.map(async (entry) => {
      if (!entry.isFile) return;
      const parsed = parseDateFromLogFilename(entry.name);
      if (!parsed || !isOlderThanRetention(parsed, retentionDays)) return;
      await remove(await getAILogFilePath(entry.name));
    }),
  );
}

export async function assertAISandboxReadablePath(path: string): Promise<void> {
  const [exportsPath, logsPath] = await Promise.all([
    getAIExportsFolderPath(),
    getAILogsFolderPath(),
  ]);

  if (!isInside(exportsPath, path) && !isInside(logsPath, path)) {
    throw new Error(
      "Sandbox IA: accès refusé. Seuls ai_exports et logs/ai sont autorisés.",
    );
  }
}

export const AI_SANDBOX_LIMITATIONS: string[] = [
  "Lecture seule sur exports analytics.",
  "Aucun accès SQLite direct.",
  "Aucun accès MT5.",
  "Aucune exécution shell/commande système.",
  "Aucun accès filesystem global hors ai_exports et logs/ai.",
  "Aucun auto-trading, aucun signal live.",
];
