// ============================================================
// CSV Validation Service — TradingBook
// ============================================================
// Valide les lignes CSV après mapping, avant l'import SQLite.
//
// Responsabilités :
//   1. Extraire la valeur de chaque champ mappé depuis une ligne CSV
//   2. Transformer les valeurs brutes (string) en types natifs
//      (number, Date, TradeSide…)
//   3. Appliquer les règles de validation métier
//   4. Retourner un résultat par ligne : valid / warning / invalid
//   5. Produire un résumé global du fichier
//
// Ce service est purement fonctionnel (pas d'effets de bord, pas d'I/O).
// Il ne crée aucun trade et n'appelle pas SQLite.
//
// Pipeline complet (pour référence) :
//   1. csvParserService     → CsvParseResult (lignes brutes)
//   2. csvMappingService    → CsvColumnMapping (champs → colonnes)
//   3. csvFormatDetectionService → BrokerDetectionResult
//   4. csvValidationService → CsvRowValidation[] + CsvValidationSummary
//   5. (futur) csvImportService → trades SQLite
// ============================================================

import type { CsvColumnMapping, TradeField } from "../../types/csvImport";
import type {
  CsvValidationStatus,
  CsvFieldError,
  CsvValidatedRow,
  CsvValidationSummary,
  CsvValidationResult,
} from "../../types/csvImport";

// ─── Helpers de parsing de valeurs ─────────────────────────

/**
 * Extrait la valeur brute d'un champ depuis une ligne CSV.
 * Retourne undefined si le champ n'est pas mappé ou si la colonne est absente.
 */
function getRawValue(
  row: Record<string, string>,
  field: TradeField,
  mapping: CsvColumnMapping,
): string | undefined {
  const col = mapping.fieldToColumn[field];
  if (!col) return undefined;
  const val = row[col];
  if (val === undefined || val.trim() === "") return undefined;
  return val.trim();
}

/**
 * Tente de parser une chaîne en nombre décimal.
 * Gère les séparateurs internationaux : virgule comme décimal (1.234,56),
 * espace comme séparateur de milliers, symboles de devises courants.
 *
 * Exemples acceptés :
 *   "1234.56", "1 234.56", "1,234.56", "-45.30",
 *   "1234,56" (fr), "1.234,56" (de/fr format)
 */
function parseNumber(raw: string): number | null {
  let s = raw
    .replace(/\s/g, "")       // supprimer les espaces (séparateurs de milliers)
    .replace(/[^0-9,.\-+]/g, ""); // retirer les caractères non numériques (€, $…)

  if (s === "") return null;

  // Détecter format avec virgule comme décimal (ex: "1234,56" ou "1.234,56")
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > lastDot) {
    // La virgule est le séparateur décimal → supprimer les points (milliers), remplacer virgule
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Le point est le séparateur décimal → supprimer les virgules (milliers)
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Liste des formats de date connus, du plus spécifique au plus générique.
 * Utilisés pour parser les dates broker avant de les convertir en ISO 8601.
 *
 * Formats couverts :
 *   - ISO 8601          : "2024-01-15T14:30:00"
 *   - MT5/MT4           : "2024.01.15 14:30:00"
 *   - Slashes           : "2024/01/15 14:30:00" ou "15/01/2024 14:30"
 *   - Date seule        : "2024-01-15" / "2024.01.15"
 */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO 8601 direct (le plus fiable)
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct;

  // MT5/MT4 : "YYYY.MM.DD HH:MM:SS"
  const mt = s.match(
    /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (mt) {
    const [, Y, M, D, h = "00", m = "00", sec = "00"] = mt;
    const d = new Date(`${Y}-${M}-${D}T${h}:${m}:${sec}`);
    if (!isNaN(d.getTime())) return d;
  }

  // Slashes : "YYYY/MM/DD HH:MM:SS" ou "DD/MM/YYYY HH:MM"
  const sl = s.match(
    /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})(?:[\sT](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (sl) {
    const [, a, b, c, h = "00", m = "00", sec = "00"] = sl;
    // Heuristique : si `a` > 31 → format YYYY/MM/DD, sinon DD/MM/YYYY
    const [Y, M, D] =
      parseInt(a) > 31 ? [a, b, c] : [c, b, a];
    const d = new Date(`${Y}-${M.padStart(2, "0")}-${D.padStart(2, "0")}T${h}:${m}:${sec}`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Normalise une valeur de side broker vers les valeurs internes "buy" / "sell".
 *
 * Gère les variantes MT5/MT4 avec modificateurs :
 *   "buy limit", "buy stop", "buy stop limit" → "buy"
 *   "sell limit", "sell stop", "sell stop limit" → "sell"
 *
 * @returns "buy" | "sell" | null si non reconnu
 */
function parseSide(raw: string): "buy" | "sell" | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("buy")) return "buy";
  if (s.startsWith("sell")) return "sell";
  if (s === "b" || s === "achat" || s === "long") return "buy";
  if (s === "s" || s === "vente" || s === "short") return "sell";
  return null;
}

/**
 * Normalise une valeur de status CSV vers les valeurs internes.
 * Si non reconnu, retourne null (pas une erreur bloquante).
 */
function parseStatus(raw: string): "open" | "closed" | "cancelled" | null {
  const s = raw.trim().toLowerCase();
  if (s === "open" || s === "ouvert" || s === "active" || s === "en cours")
    return "open";
  if (
    s === "closed" ||
    s === "fermé" ||
    s === "ferme" ||
    s === "clôturé" ||
    s === "cloture"
  )
    return "closed";
  if (s === "cancelled" || s === "canceled" || s === "annulé" || s === "annule")
    return "cancelled";
  return null;
}

// ─── Règles de validation ──────────────────────────────────

/**
 * Valide une seule ligne CSV mappée.
 *
 * Règles appliquées :
 *
 * ERREURS (bloquantes — la ligne est invalide) :
 *   - symbol manquant ou vide
 *   - opened_at manquant, vide ou non parsable comme date
 *   - entry_price manquant, non numérique ou ≤ 0
 *   - volume manquant, non numérique ou ≤ 0
 *   - side manquant ou valeur non reconnue (buy/sell attendu)
 *   - net_pnl présent mais non numérique
 *   - gross_pnl présent mais non numérique
 *   - commission présente mais non numérique
 *   - swap présent mais non numérique
 *   - exit_price présent mais ≤ 0
 *   - closed_at présent mais non parsable comme date
 *
 * AVERTISSEMENTS (non bloquants — la ligne est importable) :
 *   - side contient un modificateur (ex: "buy limit") → normalisé, signalé
 *   - closed_at mappé mais absent dans cette ligne
 *   - exit_price mappé mais absent dans cette ligne
 *   - net_pnl mappé mais absent dans cette ligne
 *   - currency absente (sera ignorée)
 *   - external_id absent (pas de déduplication possible)
 *
 * @param row     - Ligne CSV (Record<header, valeur brute>)
 * @param mapping - Mapping actif (fieldToColumn)
 * @param index   - Index 0-based de la ligne (pour affichage)
 * @returns CsvValidatedRow avec status, errors, warnings et valeurs parsées
 */
export function validateRow(
  row: Record<string, string>,
  mapping: CsvColumnMapping,
  index: number,
): CsvValidatedRow {
  const errors: CsvFieldError[] = [];
  const warnings: CsvFieldError[] = [];

  // ── symbol ───────────────────────────────────────────────
  const rawSymbol = getRawValue(row, "symbol", mapping);
  if (!rawSymbol) {
    errors.push({ field: "symbol", message: "Symbole manquant ou vide" });
  } else if (rawSymbol.length > 20) {
    errors.push({
      field: "symbol",
      message: `Symbole trop long (${rawSymbol.length} car., max 20)`,
    });
  }

  // ── side ─────────────────────────────────────────────────
  const rawSide = getRawValue(row, "side", mapping);
  let parsedSide: "buy" | "sell" | null = null;
  if (!rawSide) {
    errors.push({
      field: "side",
      message: "Sens du trade manquant (buy/sell attendu)",
    });
  } else {
    parsedSide = parseSide(rawSide);
    if (!parsedSide) {
      errors.push({
        field: "side",
        message: `Sens invalide : "${rawSide}" (valeurs acceptées : buy, sell)`,
      });
    } else if (rawSide.toLowerCase() !== parsedSide) {
      // Valeur normalisée (ex: "buy limit" → "buy")
      warnings.push({
        field: "side",
        message: `Sens normalisé : "${rawSide}" → "${parsedSide}"`,
      });
    }
  }

  // ── opened_at ────────────────────────────────────────────
  const rawOpenedAt = getRawValue(row, "opened_at", mapping);
  let parsedOpenedAt: Date | null = null;
  if (!rawOpenedAt) {
    errors.push({
      field: "opened_at",
      message: "Date d'ouverture manquante",
    });
  } else {
    parsedOpenedAt = parseDate(rawOpenedAt);
    if (!parsedOpenedAt) {
      errors.push({
        field: "opened_at",
        message: `Date d'ouverture non reconnue : "${rawOpenedAt}"`,
      });
    }
  }

  // ── entry_price ──────────────────────────────────────────
  const rawEntryPrice = getRawValue(row, "entry_price", mapping);
  let parsedEntryPrice: number | null = null;
  if (!rawEntryPrice) {
    errors.push({ field: "entry_price", message: "Prix d'entrée manquant" });
  } else {
    parsedEntryPrice = parseNumber(rawEntryPrice);
    if (parsedEntryPrice === null) {
      errors.push({
        field: "entry_price",
        message: `Prix d'entrée non numérique : "${rawEntryPrice}"`,
      });
    } else if (parsedEntryPrice <= 0) {
      errors.push({
        field: "entry_price",
        message: `Prix d'entrée invalide : ${parsedEntryPrice} (doit être > 0)`,
      });
    }
  }

  // ── volume ───────────────────────────────────────────────
  const rawVolume = getRawValue(row, "volume", mapping);
  let parsedVolume: number | null = null;
  if (!rawVolume) {
    errors.push({ field: "volume", message: "Volume manquant" });
  } else {
    parsedVolume = parseNumber(rawVolume);
    if (parsedVolume === null) {
      errors.push({
        field: "volume",
        message: `Volume non numérique : "${rawVolume}"`,
      });
    } else if (parsedVolume <= 0) {
      errors.push({
        field: "volume",
        message: `Volume invalide : ${parsedVolume} (doit être > 0)`,
      });
    }
  }

  // ── closed_at (optionnel) ─────────────────────────────────
  const rawClosedAt = getRawValue(row, "closed_at", mapping);
  let parsedClosedAt: Date | null = null;
  const closedAtMapped = mapping.fieldToColumn["closed_at"] !== null;

  if (rawClosedAt) {
    parsedClosedAt = parseDate(rawClosedAt);
    if (!parsedClosedAt) {
      errors.push({
        field: "closed_at",
        message: `Date de fermeture non reconnue : "${rawClosedAt}"`,
      });
    }
  } else if (closedAtMapped) {
    warnings.push({
      field: "closed_at",
      message: "Date de fermeture absente dans cette ligne",
    });
  }

  // ── exit_price (optionnel) ────────────────────────────────
  const rawExitPrice = getRawValue(row, "exit_price", mapping);
  let parsedExitPrice: number | null = null;
  const exitPriceMapped = mapping.fieldToColumn["exit_price"] !== null;

  if (rawExitPrice) {
    parsedExitPrice = parseNumber(rawExitPrice);
    if (parsedExitPrice === null) {
      errors.push({
        field: "exit_price",
        message: `Prix de sortie non numérique : "${rawExitPrice}"`,
      });
    } else if (parsedExitPrice <= 0) {
      errors.push({
        field: "exit_price",
        message: `Prix de sortie invalide : ${parsedExitPrice} (doit être > 0)`,
      });
    }
  } else if (exitPriceMapped) {
    warnings.push({
      field: "exit_price",
      message: "Prix de sortie absent dans cette ligne",
    });
  }

  // ── status (optionnel, non bloquant) ─────────────────────
  const rawStatus = getRawValue(row, "status", mapping);
  let parsedStatus: "open" | "closed" | "cancelled" | null = null;
  if (rawStatus) {
    parsedStatus = parseStatus(rawStatus);
    if (!parsedStatus) {
      warnings.push({
        field: "status",
        message: `Statut non reconnu : "${rawStatus}" (open/closed/cancelled attendu) — sera ignoré`,
      });
    }
  }

  // ── net_pnl (optionnel, mais numérique si présent) ────────
  const rawNetPnl = getRawValue(row, "net_pnl", mapping);
  let parsedNetPnl: number | null = null;
  const netPnlMapped = mapping.fieldToColumn["net_pnl"] !== null;

  if (rawNetPnl) {
    parsedNetPnl = parseNumber(rawNetPnl);
    if (parsedNetPnl === null) {
      errors.push({
        field: "net_pnl",
        message: `P&L net non numérique : "${rawNetPnl}"`,
      });
    }
  } else if (netPnlMapped) {
    warnings.push({
      field: "net_pnl",
      message: "P&L net absent dans cette ligne",
    });
  }

  // ── gross_pnl (optionnel) ─────────────────────────────────
  const rawGrossPnl = getRawValue(row, "gross_pnl", mapping);
  let parsedGrossPnl: number | null = null;
  if (rawGrossPnl) {
    parsedGrossPnl = parseNumber(rawGrossPnl);
    if (parsedGrossPnl === null) {
      errors.push({
        field: "gross_pnl",
        message: `P&L brut non numérique : "${rawGrossPnl}"`,
      });
    }
  }

  // ── commission (optionnel, numérique si présent) ──────────
  const rawCommission = getRawValue(row, "commission", mapping);
  let parsedCommission: number | null = null;
  if (rawCommission) {
    parsedCommission = parseNumber(rawCommission);
    if (parsedCommission === null) {
      errors.push({
        field: "commission",
        message: `Commission non numérique : "${rawCommission}"`,
      });
    }
    // Note : la commission peut être négative (certains brokers)
  }

  // ── swap (optionnel, numérique si présent) ────────────────
  const rawSwap = getRawValue(row, "swap", mapping);
  let parsedSwap: number | null = null;
  if (rawSwap) {
    parsedSwap = parseNumber(rawSwap);
    if (parsedSwap === null) {
      errors.push({
        field: "swap",
        message: `Swap non numérique : "${rawSwap}"`,
      });
    }
    // Note : le swap est souvent négatif
  }

  // ── fees (optionnel) ──────────────────────────────────────
  const rawFees = getRawValue(row, "fees", mapping);
  let parsedFees: number | null = null;
  if (rawFees) {
    parsedFees = parseNumber(rawFees);
    if (parsedFees === null) {
      errors.push({
        field: "fees",
        message: `Frais non numériques : "${rawFees}"`,
      });
    }
  }

  // ── stop_loss (optionnel) ─────────────────────────────────
  const rawStopLoss = getRawValue(row, "stop_loss", mapping);
  let parsedStopLoss: number | null = null;
  if (rawStopLoss) {
    parsedStopLoss = parseNumber(rawStopLoss);
    if (parsedStopLoss !== null && parsedStopLoss < 0) {
      warnings.push({
        field: "stop_loss",
        message: `Stop loss négatif : ${parsedStopLoss} — vérifiez la valeur`,
      });
    } else if (parsedStopLoss === null) {
      warnings.push({
        field: "stop_loss",
        message: `Stop loss non numérique : "${rawStopLoss}" — ignoré`,
      });
      parsedStopLoss = null;
    }
  }

  // ── take_profit (optionnel) ───────────────────────────────
  const rawTakeProfit = getRawValue(row, "take_profit", mapping);
  let parsedTakeProfit: number | null = null;
  if (rawTakeProfit) {
    parsedTakeProfit = parseNumber(rawTakeProfit);
    if (parsedTakeProfit !== null && parsedTakeProfit < 0) {
      warnings.push({
        field: "take_profit",
        message: `Take profit négatif : ${parsedTakeProfit} — vérifiez la valeur`,
      });
    } else if (parsedTakeProfit === null) {
      warnings.push({
        field: "take_profit",
        message: `Take profit non numérique : "${rawTakeProfit}" — ignoré`,
      });
      parsedTakeProfit = null;
    }
  }

  // ── Champs texte simples ──────────────────────────────────
  const parsedExternalId = getRawValue(row, "external_id", mapping) ?? null;
  const parsedCurrency = getRawValue(row, "currency", mapping) ?? null;

  if (!parsedCurrency && mapping.fieldToColumn["currency"] !== null) {
    warnings.push({
      field: "currency",
      message: "Devise absente — la devise du compte sera utilisée par défaut",
    });
  }
  if (!parsedExternalId) {
    warnings.push({
      field: "external_id",
      message: "Identifiant externe absent — déduplication impossible",
    });
  }

  // ── Statut final ─────────────────────────────────────────

  const status: CsvValidationStatus =
    errors.length > 0 ? "invalid" : warnings.length > 0 ? "warning" : "valid";

  return {
    index,
    status,
    errors,
    warnings,
    // Valeurs parsées — disponibles même en cas d'erreur partielle
    parsed: {
      symbol: rawSymbol ?? null,
      side: parsedSide,
      openedAt: parsedOpenedAt,
      closedAt: parsedClosedAt,
      entryPrice: parsedEntryPrice,
      exitPrice: parsedExitPrice,
      volume: parsedVolume,
      stopLoss: parsedStopLoss,
      takeProfit: parsedTakeProfit,
      commission: parsedCommission,
      swap: parsedSwap,
      fees: parsedFees,
      grossPnl: parsedGrossPnl,
      netPnl: parsedNetPnl,
      currency: parsedCurrency,
      externalId: parsedExternalId,
      status: parsedStatus,
    },
  };
}

// ─── Validation globale d'un lot de lignes ─────────────────

/**
 * Valide toutes les lignes d'un fichier CSV après mapping.
 *
 * Pour chaque ligne :
 *   - Appelle validateRow()
 *   - Catégorise : valid / warning / invalid
 *
 * Retourne :
 *   - La liste complète des lignes validées (CsvValidatedRow[])
 *   - Un résumé global (CsvValidationSummary)
 *
 * Les lignes invalides NE bloquent PAS les lignes valides.
 * L'utilisateur peut décider de tout importer ou seulement les lignes valides.
 *
 * @param rows    - Toutes les lignes CSV (Record<header, string>[])
 * @param mapping - Mapping colonnes → champs actif
 * @returns CsvValidationResult avec lignes annotées + résumé
 */
export function validateRows(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping,
): CsvValidationResult {
  const validatedRows = rows.map((row, i) => validateRow(row, mapping, i));

  const validCount = validatedRows.filter((r) => r.status === "valid").length;
  const warningCount = validatedRows.filter(
    (r) => r.status === "warning",
  ).length;
  const invalidCount = validatedRows.filter(
    (r) => r.status === "invalid",
  ).length;

  // Collecte toutes les erreurs uniques pour le résumé
  const allErrors = validatedRows.flatMap((r) => r.errors);
  const errorFrequency: Record<string, number> = {};
  for (const err of allErrors) {
    errorFrequency[err.message] = (errorFrequency[err.message] ?? 0) + 1;
  }

  // Top 3 des erreurs les plus fréquentes (utile pour les grands fichiers)
  const topErrors = Object.entries(errorFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([message, count]) => ({ message, count }));

  const summary: CsvValidationSummary = {
    totalRows: rows.length,
    validCount,
    warningCount,
    invalidCount,
    importableCount: validCount + warningCount,
    topErrors,
  };

  return { rows: validatedRows, summary };
}
