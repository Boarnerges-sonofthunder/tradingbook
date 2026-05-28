// ============================================================
// Types — Import
// ============================================================
// Correspond aux tables SQLite `imports` et `import_rows`.
// ============================================================

/**
 * Source d'import — colonne `source`.
 *
 * Valeurs SQLite autorisées :
 *   migration 002 (actuelle) : 'mt5' | 'csv' | 'manual'
 *   migration 005 (MT4)      : ajoute 'mt4' aux CHECK constraints
 *
 * @see src-tauri/migrations/005_mt4_support.sql
 */
export type ImportSource = "mt5" | "mt4" | "csv" | "manual";

/**
 * Statut de traitement — colonne `status`.
 *
 * Nouveaux statuts Phase 5 Étape 8 :
 *   - analyzed             : fichier analysé et validé, en attente de confirmation
 *   - pending_confirmation : confirmation d'import lancée (avant écriture SQLite)
 *   - imported             : trades écrits dans SQLite avec succès
 *   - cancelled            : import abandonné par l'utilisateur
 *
 * Anciens statuts (rétrocompatibilité — sessions créées avant Phase 5) :
 *   - pending              : session créée, parsing non encore effectué
 *   - in_progress          : import en cours
 *   - completed            : import terminé avec succès (équivalent à "imported")
 *   - failed               : import échoué avec message d'erreur
 */
export type ImportStatus =
  | "analyzed"
  | "pending_confirmation"
  | "imported"
  | "cancelled"
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

/** Statut d'une ligne brute — colonne `import_rows.status`. */
export type ImportRowStatus = "pending" | "imported" | "skipped" | "error";

/**
 * Session d'import — table `imports`.
 *
 * Colonnes ajoutées en migration 004 :
 *   - warningRows    : lignes valides avec avertissements (sous-ensemble d'importedRows)
 *   - fileSizeBytes  : taille en octets du fichier CSV source (NULL si non disponible)
 */
export interface ImportSession {
  id: number;
  source: ImportSource;
  filename: string | null;
  broker: string | null;
  brokerId?: number | null;
  accountId: string | null;      // account_id
  tradingAccountId?: number | null; // trading_account_id
  status: ImportStatus;
  totalRows: number;             // total_rows
  importedRows: number;          // imported_rows (lignes valides + warning)
  skippedRows: number;           // skipped_rows (doublons, etc.)
  errorRows: number;             // error_rows (lignes invalides exclues)
  warningRows: number;           // warning_rows (sous-ensemble d'importedRows)
  fileSizeBytes: number | null;  // file_size_bytes (taille fichier CSV)
  importedAt: string | null;     // imported_at — horodatage de fin
  errorMessage: string | null;   // error_message
  createdAt: string;
}

/**
 * Ligne brute d'un import — table `import_rows`.
 * Conservée pour audit et rejeu.
 */
export interface ImportRow {
  id: number;
  importId: number;             // import_id
  rowIndex: number;             // row_index
  rawData: string;              // raw_data — JSON stringifié
  status: ImportRowStatus;
  tradeId: number | null;       // trade_id — NULL avant création
  errorMessage: string | null;
  createdAt: string;
}

/** Résultat renvoyé après traitement d'un import. */
export interface ImportResult {
  session: ImportSession;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

/** Données pour démarrer une session d'import. */
export interface CreateImportInput {
  source: ImportSource;
  filename?: string | null;
  broker?: string | null;
  brokerId?: number | null;
  accountId?: string | null;
  tradingAccountId?: number | null;
  /** Taille en octets du fichier CSV source (disponible dès la sélection). */
  fileSizeBytes?: number | null;
}

