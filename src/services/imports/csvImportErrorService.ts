// ============================================================
// CSV Import Error Service — TradingBook
// ============================================================
// Phase 5 Étape 7 — Gestion centralisée des erreurs d'import.
//
// Ce service centralise la création et le logging des issues
// du pipeline d'import CSV, à chaque étape :
//
//   1. Fichier           → buildFileIssue()
//   2. Parser warnings   → buildParseWarnings()
//   3. Broker detection  → buildDetectionIssue()
//   4. Mapping           → buildMappingIssues()
//   5. Validation        → buildValidationIssues()
//   6. Rapport final     → buildImportReport()
//   7. Logging           → logImportReport()
//
// Différence erreur / avertissement :
//   - severity "error"   + blocksImport true  → tout l'import est bloqué
//   - severity "error"   + blocksImport false → seules certaines lignes
//   - severity "warning"                      → import possible, vérification recommandée
//
// Ce service est purement fonctionnel (pas d'I/O sauf logging).
// Il ne crée aucun trade et n'appelle pas SQLite.
//
// IMPORTANT : Les issues ne remplacent pas les erreurs existantes
// dans CsvValidationTable ou CsvImportPreview — elles forment un
// rapport CONSOLIDÉ complémentaire affiché dans CsvImportErrorsPanel.
// ============================================================

import { createLogger } from "../logging";
import type { TradeField, DetectionConfidence } from "../../types/csvImport";
import type {
  CsvImportIssue,
  CsvImportReport,
  CsvImportErrorCategory,
  CsvImportSeverity,
  CsvValidationSummary,
} from "../../types/csvImport";
import type { CsvParseError } from "./csvParserService";
import { TRADE_FIELDS_META } from "./csvMappingService";

// ─── Logger contextualisé ─────────────────────────────────

/**
 * Logger dédié aux erreurs du pipeline d'import CSV.
 * Les messages sont écrits dans le fichier de log local via Tauri.
 */
const logger = createLogger("csv-import");

// ─── Compteur d'ID ────────────────────────────────────────

/**
 * Compteur simple pour générer des IDs uniques dans la session.
 * Réinitialisé à chaque rechargement de la page (pas de persistance).
 */
let _issueIdCounter = 0;

function nextId(): string {
  return `csv-issue-${++_issueIdCounter}`;
}

// ─── Constructeur interne ─────────────────────────────────

/**
 * Crée une CsvImportIssue avec les valeurs par défaut.
 * Utilisé par toutes les fonctions publiques du service.
 */
function makeIssue(params: {
  category: CsvImportErrorCategory;
  severity: CsvImportSeverity;
  code: string;
  message: string;
  detail?: string;
  lineNumber?: number;
  count?: number;
  blocksImport?: boolean;
}): CsvImportIssue {
  return {
    id: nextId(),
    category: params.category,
    severity: params.severity,
    code: params.code,
    message: params.message,
    detail: params.detail,
    lineNumber: params.lineNumber,
    count: params.count,
    blocksImport: params.blocksImport ?? false,
  };
}

// ─── Builders publics ─────────────────────────────────────

/**
 * Construit une issue depuis une erreur de parsing de fichier.
 *
 * Types d'erreurs couverts :
 *   - empty_file  : le fichier ne contient aucun contenu
 *   - no_headers  : impossible de détecter des colonnes
 *   - parse_error : erreur générique de parsing
 *
 * Ces erreurs BLOQUENT tout l'import (blocksImport = true).
 */
export function buildFileIssue(error: CsvParseError): CsvImportIssue {
  const codeMap: Record<CsvParseError["type"], string> = {
    empty_file: "EMPTY_FILE",
    no_headers: "NO_HEADERS",
    parse_error: "PARSE_ERROR",
  };

  const messageMap: Record<CsvParseError["type"], string> = {
    empty_file: "Le fichier CSV est vide — aucune donnée à importer",
    no_headers: "Impossible de lire les colonnes — en-tête CSV manquant ou invalide",
    parse_error: "Erreur de lecture du fichier CSV",
  };

  return makeIssue({
    category: "file",
    severity: "error",
    code: codeMap[error.type],
    message: messageMap[error.type],
    detail: error.message,
    blocksImport: true, // Un fichier illisible bloque tout l'import
  });
}

/**
 * Construit des issues depuis les avertissements du parser CSV.
 *
 * Les warnings du parser sont non-bloquants (lignes avec nombre
 * de colonnes incorrect, lignes vides ignorées, etc.).
 * L'import peut continuer, mais certaines lignes sont ignorées.
 */
export function buildParseWarnings(warnings: string[]): CsvImportIssue[] {
  return warnings.map((msg) =>
    makeIssue({
      category: "parsing",
      severity: "warning",
      code: "PARSE_WARNING",
      message: "Ligne ignorée pendant le parsing",
      detail: msg,
      blocksImport: false,
    }),
  );
}

/**
 * Construit des issues pour les champs obligatoires sans colonne assignée.
 *
 * Chaque champ manquant génère une issue séparée (severity "error").
 * Ces erreurs BLOQUENT tout l'import car sans les champs obligatoires,
 * aucun trade ne peut être créé.
 *
 * Champs obligatoires (required = true) :
 *   symbol · side · opened_at · entry_price · volume
 */
export function buildMappingIssues(missingFields: TradeField[]): CsvImportIssue[] {
  return missingFields.map((field) => {
    // Récupère le libellé lisible depuis les métadonnées du service de mapping
    const meta = TRADE_FIELDS_META.find((m) => m.key === field);
    const label = meta?.label ?? field;

    return makeIssue({
      category: "mapping",
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
      message: `Champ obligatoire non mappé : ${label}`,
      detail: `La colonne CSV pour "${label}" n'est pas assignée — veuillez la sélectionner dans la section Mapping.`,
      blocksImport: true, // Mapping incomplet bloque tout l'import
    });
  });
}

/**
 * Construit une issue pour la détection du format broker.
 *
 * - "none"   → warning : format inconnu, mapping manuel requis
 * - "low"    → warning : confiance faible, vérifier le mapping
 * - "medium" → null    : acceptable, pas d'issue
 * - "high"   → null    : détection fiable, pas d'issue
 */
export function buildDetectionIssue(
  confidence: DetectionConfidence,
): CsvImportIssue | null {
  if (confidence === "high" || confidence === "medium") return null;

  if (confidence === "none") {
    return makeIssue({
      category: "broker",
      severity: "warning",
      code: "BROKER_NOT_DETECTED",
      message: "Format broker non reconnu — mapping manuel requis",
      detail:
        "Aucun profil broker (MT5, MT4, Fusion Markets) ne correspond aux colonnes du fichier. Vérifiez et corrigez le mapping manuellement.",
      blocksImport: false,
    });
  }

  // confidence === "low"
  return makeIssue({
    category: "broker",
    severity: "warning",
    code: "BROKER_LOW_CONFIDENCE",
    message: "Format broker incertain — vérifiez le mapping",
    detail:
      "Un profil broker a été détecté avec une confiance faible. Le mapping automatique peut être inexact.",
    blocksImport: false,
  });
}

/**
 * Construit des issues depuis le résumé de validation.
 *
 * Issues générées :
 *   1. Si invalidCount > 0 : une erreur agrégée (severity "error",
 *      blocksImport = false — les lignes valides restent importables)
 *   2. Top erreurs les plus fréquentes en avertissements pour guider
 *      l'utilisateur vers la correction
 *
 * Note : les erreurs de validation bloquent des LIGNES individuelles,
 * pas tout l'import. D'où blocksImport = false.
 */
export function buildValidationIssues(
  summary: CsvValidationSummary,
): CsvImportIssue[] {
  const issues: CsvImportIssue[] = [];

  // Issue principale : lignes invalides agrégées
  if (summary.invalidCount > 0) {
    const pct = Math.round((summary.invalidCount / summary.totalRows) * 100);

    issues.push(
      makeIssue({
        category: "validation",
        severity: "error",
        code: "INVALID_ROWS",
        message: `${summary.invalidCount} ligne${summary.invalidCount > 1 ? "s" : ""} invalide${summary.invalidCount > 1 ? "s" : ""} — exclue${summary.invalidCount > 1 ? "s" : ""} de l'import`,
        detail: `${pct} % des lignes seront ignorées. ${summary.importableCount} ligne${summary.importableCount !== 1 ? "s" : ""} reste${summary.importableCount === 1 ? "" : "nt"} importable${summary.importableCount !== 1 ? "s" : ""}.`,
        count: summary.invalidCount,
        // IMPORTANT : ne bloque pas tout l'import — les lignes valides peuvent être importées
        blocksImport: summary.importableCount === 0,
      }),
    );
  }

  // Issues pour les erreurs les plus fréquentes (top 3 du résumé)
  for (const topError of summary.topErrors) {
    issues.push(
      makeIssue({
        category: "data",
        severity: "warning",
        code: "FREQUENT_ERROR",
        message: topError.message,
        count: topError.count,
        detail: `${topError.count} ligne${topError.count > 1 ? "s" : ""} concernée${topError.count > 1 ? "s" : ""}`,
        blocksImport: false,
      }),
    );
  }

  return issues;
}

// ─── Rapport consolidé ─────────────────────────────────────

/**
 * Assemble toutes les issues en un rapport consolidé.
 *
 * Tri des issues :
 *   1. Erreurs bloquant tout l'import (blocksImport = true)
 *   2. Erreurs non bloquantes (lignes exclues)
 *   3. Avertissements
 *
 * canProceed = false uniquement si au moins une issue a blocksImport = true.
 * isClean = true si aucune issue.
 */
export function buildImportReport(issues: CsvImportIssue[]): CsvImportReport {
  if (issues.length === 0) {
    return {
      issues: [],
      errorCount: 0,
      warningCount: 0,
      canProceed: true,
      isClean: true,
    };
  }

  // Tri : blockers d'abord, puis erreurs, puis warnings
  const sorted = [...issues].sort((a, b) => {
    if (a.blocksImport && !b.blocksImport) return -1;
    if (!a.blocksImport && b.blocksImport) return 1;
    if (a.severity === "error" && b.severity !== "error") return -1;
    if (a.severity !== "error" && b.severity === "error") return 1;
    return 0;
  });

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const canProceed = !issues.some((i) => i.blocksImport);

  return {
    issues: sorted,
    errorCount,
    warningCount,
    canProceed,
    isClean: false,
  };
}

// ─── Logging ───────────────────────────────────────────────

/**
 * Enregistre les issues importantes dans le fichier de log local.
 *
 * Niveaux de log :
 *   - Erreurs bloquantes → logger.error
 *   - Erreurs non bloquantes (lignes exclues) → logger.warn
 *   - Avertissements importants → logger.info
 *
 * Les détails techniques (codes, counts) sont inclus dans les logs
 * mais pas affichés à l'utilisateur dans le panneau d'erreurs.
 *
 * @param report   - Rapport produit par buildImportReport()
 * @param filename - Nom du fichier CSV en cours d'import (optionnel)
 */
export function logImportReport(
  report: CsvImportReport,
  filename?: string,
): void {
  const prefix = filename ? `[${filename}]` : "[CSV import]";

  if (report.isClean) {
    logger.info(`${prefix} Validation réussie — aucun problème détecté`);
    return;
  }

  // Log du résumé
  logger.info(
    `${prefix} Rapport d'import : ${report.errorCount} erreur(s), ${report.warningCount} avertissement(s)`,
    {
      errorCount: report.errorCount,
      warningCount: report.warningCount,
      canProceed: report.canProceed,
    },
  );

  // Log détaillé des issues individuelles selon leur sévérité
  for (const issue of report.issues) {
    const msg = `${prefix} [${issue.code}] ${issue.message}${issue.detail ? ` — ${issue.detail}` : ""}${issue.count !== undefined ? ` (×${issue.count})` : ""}`;

    if (issue.severity === "error" && issue.blocksImport) {
      // Erreur critique — bloque tout l'import
      logger.error(msg);
    } else if (issue.severity === "error") {
      // Erreur non critique — bloque certaines lignes uniquement
      logger.warn(msg);
    } else {
      // Avertissement — informatif
      logger.info(msg);
    }
  }
}
