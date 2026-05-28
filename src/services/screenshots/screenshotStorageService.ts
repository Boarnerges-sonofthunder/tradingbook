// ============================================================
// Service - Stockage local des screenshots
// ============================================================
// Organisation standard des nouveaux fichiers :
//   screenshots/trade-{tradeId}/screenshot-{timestamp}-{uuid}.{ext}
//
// SQLite garde uniquement des chemins relatifs et des metadonnees.
// ============================================================

import { exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import {
  getScreenshotFilePath,
} from "../filesystem";
import type { TradeScreenshot } from "../../repositories/screenshotsRepository";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MIME_TO_EXTENSION: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface StoredScreenshotFile {
  filename: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface MissingScreenshot {
  screenshot: TradeScreenshot;
  expectedPath: string;
}

function getAllowedExtension(file: File): "png" | "jpg" | "webp" {
  const mimeExtension = MIME_TO_EXTENSION[file.type];
  if (mimeExtension) return mimeExtension;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") {
    return ext === "jpeg" ? "jpg" : ext;
  }

  throw new Error("Format non supporte. Formats acceptes : PNG, JPG, JPEG, WEBP.");
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function safeUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
}

function assertSafeRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:|^\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Chemin de screenshot invalide.");
  }
  return normalized;
}

export function resolveScreenshotRelativePath(screenshot: TradeScreenshot): string {
  return assertSafeRelativePath(screenshot.filePath || screenshot.filename);
}

export async function getScreenshotAbsolutePath(relativePath: string): Promise<string> {
  return getScreenshotFilePath(assertSafeRelativePath(relativePath));
}

async function ensureTradeScreenshotFolder(tradeId: number): Promise<string> {
  const folder = await getScreenshotFilePath(`trade-${tradeId}`);
  const alreadyExists = await exists(folder);
  if (!alreadyExists) await mkdir(folder, { recursive: true });
  return folder;
}

export async function storeScreenshotFile(
  tradeId: number,
  file: File,
): Promise<StoredScreenshotFile> {
  const ext = getAllowedExtension(file);
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Fichier trop lourd (max 20 Mo).");
  }

  const fileName = `screenshot-${safeTimestamp()}-${safeUuid()}.${ext}`;
  const filePath = `trade-${tradeId}/${fileName}`;
  await ensureTradeScreenshotFolder(tradeId);
  const absolutePath = await getScreenshotFilePath(`trade-${tradeId}`, fileName);
  const bytes = new Uint8Array(await file.arrayBuffer());

  await writeFile(absolutePath, bytes);

  return {
    filename: fileName,
    filePath,
    fileName,
    mimeType: file.type || `image/${ext}`,
    fileSize: file.size,
  };
}

export async function readScreenshotBytes(screenshot: TradeScreenshot): Promise<Uint8Array> {
  const absolutePath = await getScreenshotAbsolutePath(resolveScreenshotRelativePath(screenshot));
  return readFile(absolutePath);
}

export async function removeScreenshotFile(screenshot: TradeScreenshot): Promise<void> {
  const absolutePath = await getScreenshotAbsolutePath(resolveScreenshotRelativePath(screenshot));
  await remove(absolutePath);
}

export async function screenshotFileExists(screenshot: TradeScreenshot): Promise<boolean> {
  const absolutePath = await getScreenshotAbsolutePath(resolveScreenshotRelativePath(screenshot));
  return exists(absolutePath);
}

export async function findMissingScreenshotFiles(
  screenshots: TradeScreenshot[],
): Promise<MissingScreenshot[]> {
  const missing: MissingScreenshot[] = [];

  for (const screenshot of screenshots) {
    const expectedPath = await getScreenshotAbsolutePath(resolveScreenshotRelativePath(screenshot));
    if (!(await exists(expectedPath))) {
      missing.push({ screenshot, expectedPath });
    }
  }

  return missing;
}
