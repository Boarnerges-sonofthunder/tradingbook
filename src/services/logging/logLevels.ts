// ============================================================
// Niveaux de log — TradingBook
// ============================================================

/** Niveaux de log disponibles, du plus verbeux au plus critique. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Constantes pour éviter les fautes de frappe à l'usage. */
export const LOG_LEVELS = {
  /** Détails techniques — visible uniquement en développement. */
  DEBUG: "debug" as const,
  /** Déroulement normal de l'application. */
  INFO: "info" as const,
  /** Situation anormale mais récupérable. */
  WARN: "warn" as const,
  /** Erreur bloquante ou critique. */
  ERROR: "error" as const,
} satisfies Record<string, LogLevel>;
