// ============================================================
// Service - Chemins locaux des backups
// ============================================================
// SQLite stocke les metadonnees des sauvegardes. Les fichiers physiques
// restent dans backups/ sous le dossier local de TradingBook.
// ============================================================

import { DB_NAME } from "../../constants/app";
import { exists, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import {
  getBackupFilePath,
  getBackupsFolderPath,
  getTempFilePath,
} from "../filesystem";

export async function getBackupsRootPath(): Promise<string> {
  return getBackupsFolderPath();
}

export async function getBackupAbsolutePath(filename: string): Promise<string> {
  return getBackupFilePath(filename);
}

export function createBackupFilename(): string {
  return createBackupDatabaseFilename();
}

export function createBackupTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/:/g, "-")
    .replace("T", "-");
}

export function createBackupDatabaseFilename(): string {
  return `tradingbook-backup-${createBackupTimestamp()}.db`;
}

export function createBackupZipFilename(): string {
  return `TradingBook-backup-${createBackupTimestamp()}.zip`;
}

export function isCompressedBackupFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".zip");
}

export function isDatabaseBackupFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".db");
}

export function createTempDatabaseBackupFilename(): string {
  const ts = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/:/g, "-")
    .replace("T", "-");
  return `tradingbook-backup-temp-${ts}-${crypto.randomUUID()}.db`;
}

export async function backupFileExists(filename: string): Promise<boolean> {
  return exists(await getBackupAbsolutePath(filename));
}

export async function getBackupFileSize(filename: string): Promise<number | null> {
  try {
    const bytes = await readFile(await getBackupAbsolutePath(filename));
    return bytes.byteLength;
  } catch {
    return null;
  }
}

export async function removeBackupFile(filename: string): Promise<boolean> {
  const path = await getBackupAbsolutePath(filename);
  if (!(await exists(path))) return false;

  await remove(path);
  return true;
}

export async function getTempDatabaseBackupPath(filename: string): Promise<string> {
  return getTempFilePath(filename);
}

export async function removeTempDatabaseBackup(filename: string): Promise<boolean> {
  const path = await getTempDatabaseBackupPath(filename);
  if (!(await exists(path))) return false;

  await remove(path);
  return true;
}

export async function readTempDatabaseBackup(filename: string): Promise<Uint8Array> {
  return readFile(await getTempDatabaseBackupPath(filename));
}

export async function writeTempDatabaseBackup(
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  await writeFile(await getTempDatabaseBackupPath(filename), bytes);
}

export async function readBackupFile(filename: string): Promise<Uint8Array> {
  return readFile(await getBackupAbsolutePath(filename));
}

export async function writeBackupFile(
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  await writeFile(await getBackupAbsolutePath(filename), bytes);
}

export async function restoreDatabaseFileFromBackup(
  filename: string,
  databasePath: string,
): Promise<void> {
  const bytes = await readBackupFile(filename);
  await writeFile(databasePath, bytes);
}

export async function restoreDatabaseBytes(
  databaseBytes: Uint8Array,
  databasePath: string,
): Promise<void> {
  await writeFile(databasePath, databaseBytes);
}

export function getBackupDatabaseEntryName(): string {
  return DB_NAME;
}
