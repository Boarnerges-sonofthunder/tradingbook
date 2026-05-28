// ============================================================
// Service — Backups (validation + logique métier)
// ============================================================
// SQLite stocke uniquement les métadonnées de chaque backup.
// La copie physique du fichier .db est gérée par le service filesystem.
// ============================================================

import { createLogger } from "../logging";
import type { Backup, CreateBackupInput } from "../../types";
import { validate, CreateBackupInputSchema } from "../../validation";
import * as repo from "../../repositories/backupsRepository";
import { getDb } from "../database";
import { ensureAppFolder } from "../filesystem";
import {
  backupFileExists,
  createBackupDatabaseFilename,
  createBackupZipFilename,
  createTempDatabaseBackupFilename,
  getBackupAbsolutePath,
  getBackupFileSize,
  getTempDatabaseBackupPath,
  readTempDatabaseBackup,
  removeBackupFile,
  removeTempDatabaseBackup,
  writeBackupFile,
} from "./backupStorageService";
import {
  createBackupZipMetadata,
  createTradingBookBackupZip,
} from "./backupZipService";

const logger = createLogger("backups");
const AUTO_BACKUP_KEEP_LIMIT = 10;
const AUTO_BACKUP_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

let automaticBackupPromise: Promise<Backup | null> | null = null;

export interface CreateLocalDatabaseBackupOptions {
  compressed?: boolean;
}

/** Enregistre les métadonnées d'un backup dans la base. */
export async function createBackupRecord(data: CreateBackupInput): Promise<Backup> {
  validate(CreateBackupInputSchema, data);
  const backup = await repo.insertBackup(data);
  logger.info(`Backup enregistré : "${data.filename}" (trigger: ${data.trigger ?? "manual"})`);
  return backup;
}

export async function getBackupById(id: number): Promise<Backup | null> {
  return repo.findBackupById(id);
}

/** Retourne tous les backups, du plus récent au plus ancien. */
export async function getBackups(): Promise<Backup[]> {
  return repo.findBackups();
}

/** Retourne le dernier backup enregistré, ou null si aucun. */
export async function getLatestBackup(): Promise<Backup | null> {
  return repo.findLatestBackup();
}

export async function getLatestAutomaticBackup(): Promise<Backup | null> {
  return repo.findLatestBackupByTrigger("auto");
}

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function shouldSkipAutomaticBackup(latest: Backup | null): boolean {
  if (!latest) return false;

  const latestMs = new Date(latest.createdAt).getTime();
  if (!Number.isFinite(latestMs)) return false;

  return Date.now() - latestMs < AUTO_BACKUP_MIN_INTERVAL_MS;
}

async function createAvailableBackupFilename(compressed: boolean): Promise<string> {
  const baseFilename = compressed
    ? createBackupZipFilename()
    : createBackupDatabaseFilename();
  if (!(await backupFileExists(baseFilename))) return baseFilename;

  const stem = baseFilename.replace(/\.(db|zip)$/i, "");
  const extension = compressed ? "zip" : "db";
  for (let index = 2; index <= 99; index += 1) {
    const filename = `${stem}-${index}.${extension}`;
    if (!(await backupFileExists(filename))) return filename;
  }

  throw new Error("Impossible de generer un nom de backup disponible.");
}

/**
 * Cree une sauvegarde coherente de la base SQLite dans le dossier backups/.
 * `VACUUM INTO` laisse SQLite produire une copie propre de la base active,
 * plutot qu'une copie brute du fichier pendant l'utilisation.
 */
export async function createLocalDatabaseBackup(
  trigger: CreateBackupInput["trigger"] = "manual",
  options: CreateLocalDatabaseBackupOptions = {},
): Promise<Backup> {
  await ensureAppFolder("backups");
  await ensureAppFolder("temp");

  const compressed = options.compressed ?? true;
  const filename = await createAvailableBackupFilename(compressed);
  const destinationPath = await getBackupAbsolutePath(filename);
  const sqliteCopyFilename = compressed
    ? createTempDatabaseBackupFilename()
    : filename;
  const sqliteCopyPath = compressed
    ? await getTempDatabaseBackupPath(sqliteCopyFilename)
    : destinationPath;

  logger.info(
    `Creation backup SQLite local ${compressed ? "compresse" : "brut"} : ${filename}`,
  );

  try {
    const db = await getDb();
    await db.execute(`VACUUM INTO ${quoteSqlString(sqliteCopyPath)}`);

    if (compressed) {
      const databaseBytes = await readTempDatabaseBackup(sqliteCopyFilename);
      const zipBytes = await createTradingBookBackupZip(
        databaseBytes,
        createBackupZipMetadata(new Date().toISOString()),
      );
      await writeBackupFile(filename, zipBytes);
    }

    const sizeBytes = await getBackupFileSize(filename);
    const backup = await createBackupRecord({
      filename,
      sizeBytes,
      trigger,
    });

    logger.info(
      `Backup SQLite cree : "${filename}"` +
        (sizeBytes !== null ? ` (${sizeBytes} octets)` : ""),
    );

    return backup;
  } finally {
    if (compressed) {
      try {
        await removeTempDatabaseBackup(sqliteCopyFilename);
      } catch (err) {
        logger.warn(`Impossible de supprimer le backup temporaire ${sqliteCopyFilename}`, err);
      }
    }
  }
}

/**
 * Cree un backup automatique si le dernier backup auto est assez ancien.
 * Les erreurs sont loggees localement et ne bloquent pas le demarrage.
 */
export async function createAutomaticBackupIfNeeded(): Promise<Backup | null> {
  if (automaticBackupPromise) return automaticBackupPromise;

  automaticBackupPromise = (async () => {
    try {
      const latest = await getLatestAutomaticBackup();
      if (shouldSkipAutomaticBackup(latest)) {
        logger.debug("Backup automatique ignore : sauvegarde recente deja presente");
        return null;
      }

      const backup = await createLocalDatabaseBackup("auto");
      await pruneAutomaticBackups(AUTO_BACKUP_KEEP_LIMIT);
      return backup;
    } catch (err) {
      logger.error("Erreur backup automatique local", err);
      return null;
    } finally {
      automaticBackupPromise = null;
    }
  })();

  return automaticBackupPromise;
}

/**
 * Conserve les backups automatiques les plus recents.
 * Les backups manuels, pre_import et pre_migration ne sont pas purges ici.
 */
export async function pruneAutomaticBackups(
  keepLimit = AUTO_BACKUP_KEEP_LIMIT,
): Promise<number> {
  if (keepLimit < 1) {
    throw new Error("La limite de backups automatiques doit etre >= 1.");
  }

  const automaticBackups = await repo.findBackupsByTrigger("auto");
  const staleBackups = automaticBackups.slice(keepLimit);
  let removed = 0;

  for (const backup of staleBackups) {
    try {
      await removeBackupFile(backup.filename);
      if (await repo.deleteBackupById(backup.id)) {
        removed += 1;
      }
    } catch (err) {
      logger.error(`Impossible de purger le backup automatique ${backup.filename}`, err);
    }
  }

  if (removed > 0) {
    logger.info(`${removed} backup(s) automatique(s) ancien(s) purge(s)`);
  }

  return removed;
}

/** Supprime les métadonnées d'un backup. Le fichier physique reste sur disque. */
export async function deleteBackupRecord(id: number): Promise<boolean> {
  const deleted = await repo.deleteBackupById(id);
  if (deleted) logger.info(`Métadonnées backup supprimées : id=${id}`);
  return deleted;
}

/** Supprime un backup local complet: fichier physique + métadonnées SQLite. */
export async function deleteBackupWithFile(id: number): Promise<boolean> {
  const backup = await getBackupById(id);
  if (!backup) return false;

  try {
    await removeBackupFile(backup.filename);
  } catch (err) {
    logger.warn(`Impossible de supprimer le fichier backup ${backup.filename}`, err);
  }

  const deleted = await repo.deleteBackupById(id);
  if (deleted) logger.info(`Backup supprimé : id=${id} fichier=${backup.filename}`);
  return deleted;
}

/** Supprime les métadonnées des backups plus anciens que N jours. */
export async function pruneOldBackupRecords(keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();
  const count = await repo.deleteBackupsBefore(cutoff);
  if (count > 0) {
    logger.info(`${count} anciens backups purgés (avant ${cutoff})`);
  }
  return count;
}
