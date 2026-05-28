// ============================================================
// Service - Restauration locale des backups SQLite
// ============================================================
// La restauration est volontairement centralisee ici :
// les composants React choisissent un backup et confirment l'action,
// mais ne manipulent jamais directement les chemins systeme.
// ============================================================

import type { Backup } from "../../types";
import { closeDb, getDatabaseFilePath } from "../database";
import { createLogger } from "../logging";
import {
  backupFileExists,
  createTempDatabaseBackupFilename,
  getBackupAbsolutePath,
  getBackupFileSize,
  isCompressedBackupFilename,
  readBackupFile,
  readTempDatabaseBackup,
  removeTempDatabaseBackup,
  restoreDatabaseFileFromBackup,
  restoreDatabaseBytes,
  writeTempDatabaseBackup,
} from "./backupStorageService";
import { validateTradingBookBackupZip } from "./backupZipService";
import { createLocalDatabaseBackup, getBackupById } from "./backupsService";

const logger = createLogger("backups-restore");

export interface BackupRestoreDetails {
  backup: Backup;
  filename: string;
  absolutePath: string;
  exists: boolean;
  sizeBytes: number | null;
  createdAt: string;
  trigger: Backup["trigger"];
  version: string | null;
  format: "db" | "zip";
}

export interface RestoreBackupOptions {
  confirmed: boolean;
}

export interface RestoreBackupResult {
  restoredBackup: Backup;
  safetyBackup: Backup;
  restoredFromPath: string;
  databasePath: string;
  reloadRequired: true;
}

function assertRestoreConfirmed(options: RestoreBackupOptions): void {
  if (!options.confirmed) {
    throw new Error("Confirmation obligatoire avant restauration du backup.");
  }
}

async function resolveBackupOrThrow(id: number): Promise<Backup> {
  const backup = await getBackupById(id);
  if (!backup) {
    throw new Error(`Backup introuvable : id=${id}`);
  }
  return backup;
}

/**
 * Retourne les informations affichees avant restauration.
 * La version est prevue dans le contrat UI mais n'est pas encore stockee
 * dans les metadonnees de backup actuelles.
 */
export async function getBackupRestoreDetails(
  id: number,
): Promise<BackupRestoreDetails> {
  const backup = await resolveBackupOrThrow(id);
  const format = isCompressedBackupFilename(backup.filename) ? "zip" : "db";
  const [absolutePath, exists, diskSize] = await Promise.all([
    getBackupAbsolutePath(backup.filename),
    backupFileExists(backup.filename),
    getBackupFileSize(backup.filename),
  ]);
  let version: string | null = null;

  if (exists && format === "zip") {
    const validation = await validateTradingBookBackupZip(
      await readBackupFile(backup.filename),
    );
    version = String(validation.metadata.formatVersion);
  }

  return {
    backup,
    filename: backup.filename,
    absolutePath,
    exists,
    sizeBytes: diskSize ?? backup.sizeBytes,
    createdAt: backup.createdAt,
    trigger: backup.trigger,
    version,
    format,
  };
}

/**
 * Restaure un backup SQLite local.
 *
 * Ordre volontairement strict :
 * 1. verifier la confirmation et l'existence du backup ;
 * 2. creer un backup de securite de la base actuelle ;
 * 3. fermer la connexion SQLite ;
 * 4. remplacer le fichier tradingbook.db ;
 * 5. laisser l'UI recharger l'application.
 */
export async function restoreBackupById(
  id: number,
  options: RestoreBackupOptions,
): Promise<RestoreBackupResult> {
  assertRestoreConfirmed(options);

  const details = await getBackupRestoreDetails(id);
  if (!details.exists) {
    throw new Error(`Fichier backup introuvable : ${details.filename}`);
  }

  logger.info(`Preparation restauration backup : ${details.filename}`);

  const extractedDatabaseFilename =
    details.format === "zip" ? createTempDatabaseBackupFilename() : null;

  try {
    if (details.format === "zip" && extractedDatabaseFilename) {
      const validation = await validateTradingBookBackupZip(
        await readBackupFile(details.filename),
      );
      await writeTempDatabaseBackup(
        extractedDatabaseFilename,
        validation.databaseBytes,
      );
      logger.info(
        `Backup ZIP valide et extrait temporairement : ${details.filename}`,
      );
    }

    const safetyBackup = await createLocalDatabaseBackup("manual");
    logger.info(
      `Backup de securite cree avant restauration : ${safetyBackup.filename}`,
    );

    const databasePath = await getDatabaseFilePath();

    await closeDb();

    if (details.format === "zip" && extractedDatabaseFilename) {
      await restoreDatabaseBytes(
        await readTempDatabaseBackup(extractedDatabaseFilename),
        databasePath,
      );
    } else {
      await restoreDatabaseFileFromBackup(details.filename, databasePath);
    }

    logger.info(
      `Base SQLite restauree depuis "${details.filename}". Rechargement requis.`,
    );

    return {
      restoredBackup: details.backup,
      safetyBackup,
      restoredFromPath: details.absolutePath,
      databasePath,
      reloadRequired: true,
    };
  } catch (err) {
    logger.error(`Erreur restauration backup ${details.filename}`, err);
    throw err;
  } finally {
    if (extractedDatabaseFilename) {
      try {
        await removeTempDatabaseBackup(extractedDatabaseFilename);
      } catch (err) {
        logger.warn(
          `Impossible de supprimer l'extraction temporaire ${extractedDatabaseFilename}`,
          err,
        );
      }
    }
  }
}
