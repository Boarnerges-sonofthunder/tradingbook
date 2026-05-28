// ============================================================
// Types — CSV Import Mapping
// ============================================================
// Définit le système de mapping colonnes CSV ↔ champs trades.
//
// Utilisé par :
//   - csvMappingService  : logique d'auto-détection
//   - CsvMappingSection  : composant UI de configuration
//   - ImportsPage        : état global de l'import en cours
// ============================================================

// ─── Champ interne ─────────────────────────────────────────

/**
 * Clé interne d'un champ trade — snake_case, correspond aux colonnes SQLite.
 * Ces 17 clés couvrent l'ensemble des données importables d'un trade.
 */
export type TradeField =
  | "external_id"
  | "symbol"
  | "side"
  | "status"
  | "opened_at"
  | "closed_at"
  | "entry_price"
  | "exit_price"
  | "volume"
  | "stop_loss"
  | "take_profit"
  | "commission"
  | "swap"
  | "fees"
  | "gross_pnl"
  | "net_pnl"
  | "currency";

// ─── Métadonnées ────────────────────────────────────────────

/** Format de valeur attendu pour un champ — utilisé pour la validation future. */
export type TradeFieldType = "text" | "number" | "datetime" | "side";

/**
 * Métadonnées d'un champ trade interne.
 * Utilisées pour générer l'interface de mapping et les messages d'erreur.
 */
export interface TradeFieldMeta {
  /** Clé interne du champ. */
  key: TradeField;
  /** Libellé lisible en français affiché dans l'interface. */
  label: string;
  /** Description courte du contenu attendu (affiché comme sous-texte). */
  description: string;
  /**
   * Vrai si le champ est obligatoire pour tout type de trade.
   * Un import échouera si ce champ n'est pas mappé.
   */
  required: boolean;
  /**
   * Vrai si le champ est recommandé pour les trades fermés.
   * Affiché dans le groupe "Trades fermés" de l'interface.
   */
  closedRequired: boolean;
  /** Format attendu pour la validation et la transformation des valeurs. */
  type: TradeFieldType;
}

// ─── Mapping ────────────────────────────────────────────────

/**
 * Mapping complet colonnes CSV → champs internes.
 *
 * `fieldToColumn` associe chaque champ interne (`TradeField`) à
 * un nom de colonne CSV tel qu'il apparaît dans le header du fichier,
 * ou `null` si le champ n'est pas mappé (sera ignoré à l'import).
 *
 * `isValid` et `missingRequired` sont recalculés à chaque modification.
 */
export interface CsvColumnMapping {
  /**
   * Association champ interne → colonne CSV.
   * `null` = champ non mappé, ignoré lors de l'import.
   */
  fieldToColumn: Record<TradeField, string | null>;
  /**
   * Vrai si tous les champs `required` ont une colonne assignée.
   * Nécessaire pour pouvoir lancer l'import.
   */
  isValid: boolean;
  /**
   * Liste des clés de champs `required` sans colonne mappée.
   * Vide si `isValid === true`.
   */
  missingRequired: TradeField[];
}

// ─── Détection de format broker ─────────────────────────────

/**
 * Identifiant d'un profil broker connu.
 * Étendu dans brokerCsvProfiles.ts si de nouveaux formats sont ajoutés.
 */
export type BrokerFormat = "mt5" | "mt4" | "fusion_markets";

/**
 * Niveau de confiance retourné par csvFormatDetectionService.
 *
 * - "high"   : score ≥ minScoreHigh du profil  → mapping appliqué automatiquement
 * - "medium" : score ≥ minScoreMedium           → mapping proposé, vérification recommandée
 * - "low"    : score ≥ MIN_SCORE_THRESHOLD      → format possible, mapping non appliqué
 * - "none"   : aucun profil reconnu             → mapping manuel uniquement
 */
export type DetectionConfidence = "high" | "medium" | "low" | "none";

/**
 * Résultat complet de la détection automatique du format broker CSV.
 * Produit par `detectBrokerFormat()` dans csvFormatDetectionService.
 *
 * Utilisé par :
 *   - ImportsPage     : afficher la bannière de détection
 *   - CsvMappingSection : initialiser avec le mapping recommandé
 */
export interface BrokerDetectionResult {
  /**
   * Identifiant du format détecté.
   * `null` si aucun profil ne correspond (confidence === "none").
   */
  format: BrokerFormat | null;

  /**
   * Nom lisible du broker/plateforme (ex: "MetaTrader 5").
   * `null` si format non reconnu.
   */
  formatName: string | null;

  /**
   * Niveau de confiance de la détection.
   * Déterminé par le ratio de colonnes-signature trouvées dans le CSV.
   */
  confidence: DetectionConfidence;

  /**
   * Score brut de correspondance entre 0 et 1.
   * Score = colonnes trouvées / colonnes signature du profil.
   */
  score: number;

  /**
   * Mapping recommandé construit depuis les fieldAliases du profil détecté.
   * `null` si confidence === "none" — utiliser autoDetectMapping() dans ce cas.
   *
   * Ce mapping est plus précis que l'auto-détection générique car il
   * connaît les noms exacts de colonnes du broker (ex: "S / L" MT5).
   */
  recommendedMapping: CsvColumnMapping | null;

  /**
   * Colonnes-signature du profil trouvées dans le CSV.
   * Utile pour afficher les détails de la détection.
   */
  matchedFields: string[];

  /**
   * Colonnes-signature du profil absentes du CSV.
   * Indique les données potentiellement manquantes pour ce format.
   */
  missingFields: string[];
}

// ─── Validation de lignes CSV ────────────────────────────────

/**
 * Statut de validation d'une ligne CSV.
 *
 * - "valid"   : tous les champs sont valides — ligne importable sans réserve
 * - "warning" : champs obligatoires OK mais des données optionnelles sont
 *               manquantes ou normalisées — ligne importable avec signalement
 * - "invalid" : au moins un champ obligatoire est manquant ou invalide —
 *               la ligne ne peut pas être importée
 */
export type CsvValidationStatus = "valid" | "warning" | "invalid";

/**
 * Erreur ou avertissement sur un champ spécifique d'une ligne CSV.
 * Affiché dans CsvValidationTable pour guider l'utilisateur.
 */
export interface CsvFieldError {
  /** Champ interne concerné. */
  field: TradeField;
  /** Message lisible en français. */
  message: string;
}

/**
 * Valeurs parsées d'une ligne CSV après transformation.
 * Disponibles même si la ligne contient des erreurs (valeurs partielles).
 * Seront converties en CreateTradeInput lors de l'import futur.
 */
export interface CsvParsedValues {
  symbol: string | null;
  side: "buy" | "sell" | null;
  openedAt: Date | null;
  closedAt: Date | null;
  entryPrice: number | null;
  exitPrice: number | null;
  volume: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number | null;
  swap: number | null;
  fees: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  currency: string | null;
  externalId: string | null;
  status: "open" | "closed" | "cancelled" | null;
}

/**
 * Résultat de la validation d'une ligne CSV.
 * Produit par `validateRow()` dans csvValidationService.
 */
export interface CsvValidatedRow {
  /** Index 0-based de la ligne dans le CSV (pour affichage : index + 2). */
  index: number;
  /** Statut de la ligne : valid / warning / invalid. */
  status: CsvValidationStatus;
  /** Erreurs bloquantes — empêchent l'import de cette ligne. */
  errors: CsvFieldError[];
  /** Avertissements non bloquants — la ligne reste importable. */
  warnings: CsvFieldError[];
  /** Valeurs transformées depuis les chaînes brutes du CSV. */
  parsed: CsvParsedValues;
}

/**
 * Résumé global de la validation d'un fichier CSV.
 * Affiché dans CsvValidationSummary avant l'import.
 */
export interface CsvValidationSummary {
  /** Nombre total de lignes de données. */
  totalRows: number;
  /** Lignes valides (aucune erreur, aucun avertissement). */
  validCount: number;
  /** Lignes avec avertissements (importables mais signalées). */
  warningCount: number;
  /** Lignes invalides (ne peuvent pas être importées). */
  invalidCount: number;
  /** Lignes pouvant être importées (valid + warning). */
  importableCount: number;
  /** Top 3 des messages d'erreur les plus fréquents. */
  topErrors: { message: string; count: number }[];
}

/**
 * Résultat complet de la validation d'un fichier CSV.
 * Produit par `validateRows()` dans csvValidationService.
 */
export interface CsvValidationResult {
  /** Toutes les lignes avec leur statut et détails. */
  rows: CsvValidatedRow[];
  /** Résumé agrégé pour l'affichage du panneau de synthèse. */
  summary: CsvValidationSummary;
}

// ─── Rapport d'erreurs d'import CSV ─────────────────────────
//
// Phase 5 Étape 7 — Gestion centralisée des erreurs.
//
// Ces types couvrent l'ensemble des problèmes pouvant survenir
// à chaque étape du pipeline d'import :
//
//   file      → problème de fichier (vide, non-CSV, lecture)
//   parsing   → erreur pendant le parsing du contenu
//   mapping   → champ obligatoire non assigné à une colonne
//   broker    → format broker non reconnu ou confiance faible
//   validation → ligne avec données invalides (bloque la ligne)
//   data      → anomalie dans les valeurs (avertissement)
//
// Différence erreur / avertissement :
//   - severity "error"   : problème qui empêche l'import
//     → si blocksImport = true : TOUT l'import est bloqué
//     → si blocksImport = false : seule la ligne est exclue
//   - severity "warning" : signalement, l'import peut continuer

/**
 * Catégorie de l'issue pour le regroupement dans l'UI.
 *
 * - "file"       : problème de fichier (vide, non-CSV, lecture échouée)
 * - "parsing"    : erreur ou avertissement de parsing CSV
 * - "mapping"    : champ obligatoire sans colonne assignée
 * - "broker"     : format broker non reconnu / confiance faible
 * - "validation" : lignes CSV avec des champs invalides (bloquants)
 * - "data"       : données optionnelles manquantes (non bloquant)
 */
export type CsvImportErrorCategory =
  | "file"
  | "parsing"
  | "mapping"
  | "broker"
  | "validation"
  | "data";

/** Sévérité de l'issue — détermine si elle bloque ou signale. */
export type CsvImportSeverity = "error" | "warning";

/**
 * Issue consolidée : erreur ou avertissement dans le pipeline d'import.
 * Produite par les fonctions de csvImportErrorService.
 *
 * Chaque issue correspond à un problème spécifique identifiable
 * par son `code` (machine-readable) et son `message` (human-readable).
 */
export interface CsvImportIssue {
  /**
   * Identifiant unique de l'issue dans la session courante.
   * Utilisé comme key React.
   */
  id: string;

  /** Catégorie pour le regroupement dans le panneau d'erreurs. */
  category: CsvImportErrorCategory;

  /** Sévérité : erreur bloquante ou avertissement non bloquant. */
  severity: CsvImportSeverity;

  /**
   * Code d'erreur machine-readable (SNAKE_UPPER_CASE).
   * Exemples : "EMPTY_FILE", "MISSING_SYMBOL", "BROKER_NOT_DETECTED".
   * Utilisé pour le logging et l'internationalisation future.
   */
  code: string;

  /** Message court et lisible en français pour l'utilisateur. */
  message: string;

  /**
   * Détail technique ou champ concerné — affiché en sous-texte.
   * Ex : "Colonnes manquantes : symbol, side" ou nom du champ.
   */
  detail?: string;

  /**
   * Numéro de ligne CSV si l'issue est liée à une ligne précise.
   * 1-based (ligne 1 = header, données à partir de la ligne 2).
   */
  lineNumber?: number;

  /**
   * Nombre d'occurrences si l'issue est agrégée.
   * Ex : count = 12 pour "12 lignes sans symbole".
   */
  count?: number;

  /**
   * Si true : cette issue bloque TOUT l'import (pas seulement une ligne).
   * Ex : fichier vide, mapping incomplet.
   * Si false : l'import peut continuer pour les autres lignes.
   */
  blocksImport: boolean;
}

/**
 * Rapport consolidé de toutes les issues du pipeline d'import en cours.
 * Produit par `buildImportReport()` dans csvImportErrorService.
 *
 * Représente l'état courant de l'import — recalculé à chaque
 * changement de parseOutcome, columnMapping ou validationResult.
 */
export interface CsvImportReport {
  /**
   * Toutes les issues triées : erreurs bloquantes d'abord,
   * puis erreurs non bloquantes, puis avertissements.
   */
  issues: CsvImportIssue[];

  /** Nombre d'issues avec severity === "error". */
  errorCount: number;

  /** Nombre d'issues avec severity === "warning". */
  warningCount: number;

  /**
   * Vrai si TOUT l'import est bloqué par au moins une issue
   * avec blocksImport = true (fichier vide, mapping incomplet…).
   * Si false, les lignes valides restent importables.
   */
  canProceed: boolean;

  /** Vrai si aucune issue — import entièrement propre. */
  isClean: boolean;
}

// ─── Déduplication des trades ────────────────────────────────
//
// Phase 5 Étape 9 — Détection des doublons avant l'import.
//
// DEUX NIVEAUX :
//   exact_duplicate   → trade déjà présent à l'identique → IGNORÉ
//   probable_duplicate → trade ressemblant → AFFICHÉ pour vérification
//
// La déduplication se fait côté service (tradeDeduplicationService.ts).
// React ne voit que ce rapport en lecture seule.

/**
 * Statut de déduplication d'une ligne CSV.
 *
 * - "new"               : aucun trade existant correspondant → sera importé
 * - "exact_duplicate"   : trade identique déjà présent → IGNORÉ à l'import
 * - "probable_duplicate": trade ressemblant mais pas identique → à vérifier
 */
export type CsvDeduplicationStatus =
  | "new"
  | "exact_duplicate"
  | "probable_duplicate";

/**
 * Correspondance entre une ligne CSV et un trade existant.
 * Contient les informations du trade correspondant pour l'affichage.
 */
export interface CsvDeduplicationMatch {
  /** ID du trade existant correspondant. */
  tradeId: number;
  /** Résumé lisible du trade existant (ex: "#42 EURUSD buy 0.1lot · 2024-01-15"). */
  tradeSummary: string;
  /** Champs qui ont conduit à la correspondance. */
  matchedFields: string[];
  /**
   * Score de ressemblance de 0 à 1.
   * 1.0 = correspondance exacte, < 1.0 = correspondance probable.
   */
  score: number;
  /** Explication lisible des critères de correspondance. */
  reason: string;
}

/**
 * Ligne CSV avec son statut de déduplication.
 * `index` correspond à `CsvValidatedRow.index`.
 */
export interface CsvDeduplicatedRow {
  /** Index 0-based — correspond à CsvValidatedRow.index. */
  index: number;
  /** Statut de déduplication. */
  status: CsvDeduplicationStatus;
  /**
   * Informations sur le trade correspondant.
   * null si status === "new" (aucune correspondance).
   */
  match: CsvDeduplicationMatch | null;
}

/**
 * Rapport complet de déduplication pour un fichier CSV.
 * Produit par `checkDuplicates()` dans tradeDeduplicationService.
 */
export interface CsvDeduplicationReport {
  /** Toutes les lignes avec leur statut de déduplication. */
  rows: CsvDeduplicatedRow[];
  /** Nombre de lignes qui seront importées (aucune correspondance). */
  newCount: number;
  /** Nombre de doublons exacts — seront automatiquement ignorés. */
  exactDuplicateCount: number;
  /** Nombre de doublons probables — affichés pour vérification manuelle. */
  probableDuplicateCount: number;
  /** Vrai si au moins un doublon exact ou probable a été trouvé. */
  hasDuplicates: boolean;
}
