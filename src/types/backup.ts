// ============================================================
// Types — Backup
// ============================================================
// Table `backups` — SQLite stocke uniquement les métadonnées.
// Le fichier .db physique est dans le dossier backups local.
// ============================================================

/**
 * Déclencheur de la sauvegarde.
 * Correspond à la colonne : CHECK(trigger IN ('manual', 'auto', 'pre_import', 'pre_migration'))
 */
export type BackupTrigger = "manual" | "auto" | "pre_import" | "pre_migration";

/** Entité Backup — table `backups`. */
export interface Backup {
  id: number;
  /** Nom du fichier (ex : "backup_2024-01-15T14-30-00.db"). */
  filename: string;
  /** Taille du fichier en octets (null si inconnu). */
  sizeBytes: number | null;  // size_bytes
  trigger: BackupTrigger;
  createdAt: string;
}

/** Données pour enregistrer un backup. */
export interface CreateBackupInput {
  filename: string;
  sizeBytes?: number | null;
  trigger?: BackupTrigger;
}
