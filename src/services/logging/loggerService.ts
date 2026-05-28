// ============================================================
// loggerService - logs systeme locaux TradingBook
// ============================================================
// Ecrit les logs techniques dans :
//   %LOCALAPPDATA%/com.tradingbook.app/logs/tradingbook-YYYY-MM-DD.log
//
// Ce service est la couche fichier du logging. Les composants React ne lisent
// jamais directement le filesystem : ils passent par les helpers exportes ici.
// ============================================================

import { readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { ensureAppFolder, getLogFilePath, getLogsFolderPath } from "../filesystem";
import type { LogLevel } from "./logLevels";

export interface LogFileInfo {
  filename: string;
  date: string;
  path: string;
}

const LOG_FILE_PREFIX = "tradingbook-";
const LOG_FILE_EXTENSION = ".log";
const LOG_RETENTION_DAYS = 30;
const MAX_UI_LOG_LINES = 800;

let writeQueue: Promise<void> = Promise.resolve();
let rotationDone = false;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimestamp(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getDailyLogFilename(date = new Date()): string {
  return `${LOG_FILE_PREFIX}${formatDate(date)}${LOG_FILE_EXTENSION}`;
}

function parseLogDate(filename: string): string | null {
  const match = /^tradingbook-(\d{4}-\d{2}-\d{2})\.log$/.exec(filename);
  return match?.[1] ?? null;
}

function serializeData(data: unknown): string {
  if (data === undefined) return "";
  if (data instanceof Error) {
    const stackLine = data.stack?.split("\n")[1]?.trim();
    return stackLine
      ? `${data.name}: ${data.message} (${stackLine})`
      : `${data.name}: ${data.message}`;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function normalizeContext(context: string): string {
  return context.trim().replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
}

function buildLogLine(
  level: LogLevel,
  context: string,
  message: string,
  data?: unknown,
): string {
  const extra = serializeData(data);
  return (
    `[${formatTimestamp(new Date())}] ` +
    `[${level.toUpperCase()}] ` +
    `[${normalizeContext(context)}]\n` +
    (extra ? `${message} | ${extra}` : message) +
    "\n"
  );
}

async function rotateOldLogs(): Promise<void> {
  if (rotationDone) return;
  rotationDone = true;

  const logsPath = await getLogsFolderPath();
  const entries = await readDir(logsPath);
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile) return;

      const dateText = parseLogDate(entry.name);
      if (!dateText) return;

      const dateMs = new Date(`${dateText}T00:00:00`).getTime();
      if (Number.isFinite(dateMs) && dateMs < cutoff) {
        await remove(await getLogFilePath(entry.name));
      }
    }),
  );
}

async function appendLogLine(line: string): Promise<void> {
  await ensureAppFolder("logs");
  await rotateOldLogs();
  await writeTextFile(await getLogFilePath(getDailyLogFilename()), line, {
    append: true,
    create: true,
  });
}

/**
 * Ecriture locale non bloquante.
 * Les erreurs d'ecriture sont ignorees pour ne jamais casser le workflow metier.
 */
export function writeLocalLog(
  level: LogLevel,
  context: string,
  message: string,
  data?: unknown,
): void {
  const line = buildLogLine(level, context, message, data);
  writeQueue = writeQueue.then(() => appendLogLine(line)).catch(() => {});
}

export async function listLogFiles(): Promise<LogFileInfo[]> {
  await ensureAppFolder("logs");
  const logsPath = await getLogsFolderPath();
  const entries = await readDir(logsPath);

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile)
      .map(async (entry) => {
        const date = parseLogDate(entry.name);
        if (!date) return null;
        return {
          filename: entry.name,
          date,
          path: await getLogFilePath(entry.name),
        } satisfies LogFileInfo;
      }),
  );

  return files
    .filter((file): file is LogFileInfo => file !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function readLogFile(filename: string): Promise<string> {
  if (!parseLogDate(filename)) {
    throw new Error("Nom de fichier log invalide.");
  }

  const content = await readTextFile(await getLogFilePath(filename));
  const lines = content.split(/\r?\n/);
  if (lines.length <= MAX_UI_LOG_LINES) return content;
  return lines.slice(-MAX_UI_LOG_LINES).join("\n");
}

export async function getTodayLogFilename(): Promise<string> {
  await ensureAppFolder("logs");
  return getDailyLogFilename();
}
