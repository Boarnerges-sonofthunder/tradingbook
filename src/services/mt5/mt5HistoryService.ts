// ============================================================
// MT5 History Service — TradingBook
// ============================================================
// Phase 6 Étape 3 — Lecture de l'historique des deals MT5.
//
// RESPONSABILITÉS :
//   - Construire les arguments pour mt5_bridge.py --mode history
//   - Exécuter le bridge Python via tauri-plugin-shell
//   - Parser et valider la sortie JSON
//   - Retourner un MT5HistoryResult typé
//   - Gérer toutes les erreurs sans jamais throw
//
// CE QUE CE SERVICE NE FAIT PAS (Étape 4+) :
//   - Mapper les deals vers les trades TradingBook
//   - Importer dans SQLite
//   - Dédupliquer les trades existants
//
// FLUX D'EXÉCUTION :
//   1. buildHistoryArgs()    — construit les arguments CLI
//   2. runPythonHistory()    — exécute python mt5_bridge.py --mode history ...
//   3. parseHistoryOutput()  — JSON.parse(stdout) → MT5HistoryResult
//   4. Retourne le résultat (ou erreur structurée)
//
// RÈGLES DE SÉCURITÉ :
//   - LECTURE SEULE — aucun ordre, aucune écriture SQLite
//   - Aucun credential broker transmis
//   - Timeout 30 secondes pour éviter un blocage UI
// ============================================================

import { Command } from "@tauri-apps/plugin-shell";
import { resourceDir, join } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import { buildMT5ResultError } from "./mt5ErrorService";
import {
  getMT5PythonCommandOrder,
  isMT5PythonCommandNotFoundError,
  type MT5PythonCommandName,
} from "./mt5PythonShell";
import type {
  MT5HistoryPeriod,
  MT5HistoryResult,
  MT5CheckErrorCode,
} from "../../types/mt5";

const logger = createLogger("mt5-history");

// ─── Constantes ────────────────────────────────────────────

const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";

/** Timeout pour la lecture de l'historique (30 s, peut être long avec beaucoup de deals). */
const HISTORY_TIMEOUT_MS = 30_000;

// Cache runtime pour limiter appels resourceDir/join + fallback python recurrent.
let cachedScriptPathPromise: Promise<string> | null = null;
let preferredPythonCommand: MT5PythonCommandName | null = null;

// ─── Helpers internes ──────────────────────────────────────

/**
 * Résout le chemin absolu vers le script bridge Python.
 * Identique à mt5BridgeService — les deux services partagent le même script.
 */
async function resolveScriptPath(): Promise<string> {
  if (cachedScriptPathPromise !== null) {
    return cachedScriptPathPromise;
  }

  cachedScriptPathPromise = (async () => {
    try {
      const resDir = await resourceDir();
      return await join(resDir, BRIDGE_SCRIPT_NAME);
    } catch (err) {
      logger.warn(`resolveScriptPath fallback : ${String(err)}`);
      return BRIDGE_SCRIPT_NAME;
    }
  })();

  return cachedScriptPathPromise;
}

/**
 * Construit un résultat d'erreur structuré pour MT5HistoryResult.
 */
function buildHistoryError(
  errorCode: MT5CheckErrorCode,
  message: string,
  technicalDetails: unknown = message,
): MT5HistoryResult {
  const error = buildMT5ResultError({
    code: errorCode,
    message,
    technicalDetails,
    context: "history",
  });

  return {
    success: false,
    deals: [],
    totalDeals: 0,
    errorCode: error.errorCode,
    message: error.message,
  };
}

/**
 * Construit les arguments CLI à passer au bridge Python.
 *
 * Périodes prédéfinies (--period) :
 *   "today"  → --mode history --period today
 *   "7d"     → --mode history --period 7d
 *   "30d"    → --mode history --period 30d
 *
 * Plage personnalisée (--from / --to) :
 *   "custom" → --mode history --from YYYY-MM-DD [--to YYYY-MM-DD]
 *
 * @param scriptPath — chemin absolu vers mt5_bridge.py
 * @param period     — période prédéfinie ou "custom"
 * @param fromDate   — date de début (YYYY-MM-DD), requis si period = "custom"
 * @param toDate     — date de fin (YYYY-MM-DD), optionnel
 */
function buildHistoryArgs(
  scriptPath: string,
  period: MT5HistoryPeriod,
  fromDate: string | null,
  toDate: string | null,
  terminalPath: string | null,
): string[] {
  const base = [scriptPath, "--mode", "history"];
  const normalizedTerminalPath = terminalPath?.trim() ?? "";

  if (period === "custom") {
    if (!fromDate) {
      // Ne devrait pas arriver si l'UI valide correctement
      logger.warn("buildHistoryArgs : period=custom sans fromDate, fallback sur 30d");
      const fallbackArgs = [...base, "--period", "30d"];
      if (normalizedTerminalPath !== "") {
        fallbackArgs.push("--terminal-path", normalizedTerminalPath);
      }
      return fallbackArgs;
    }
    const args = [...base, "--from", fromDate];
    if (toDate) args.push("--to", toDate);
    if (normalizedTerminalPath !== "") {
      args.push("--terminal-path", normalizedTerminalPath);
    }
    return args;
  }

  // Périodes prédéfinies : today, 7d, 30d
  const args = [...base, "--period", period];
  if (normalizedTerminalPath !== "") {
    args.push("--terminal-path", normalizedTerminalPath);
  }
  return args;
}

function validateDateRange(
  period: MT5HistoryPeriod,
  fromDate: string | null,
  toDate: string | null,
): string | null {
  if (period !== "custom") return null;
  if (!fromDate) return "period=custom sans date de début.";

  const fromTime = Date.parse(fromDate);
  if (Number.isNaN(fromTime)) return `Date de début invalide : ${fromDate}`;

  if (toDate) {
    const toTime = Date.parse(toDate);
    if (Number.isNaN(toTime)) return `Date de fin invalide : ${toDate}`;
    if (toTime < fromTime) {
      return `Date de fin avant la date de début : ${toDate} < ${fromDate}`;
    }
  }

  return null;
}

/**
 * Tente d'exécuter le bridge Python avec le nom de commande Tauri donné.
 * Retourne null si la commande n'est pas dans le PATH (signal de fallback).
 */
async function tryRunPythonWithArgs(
  cmdName: MT5PythonCommandName,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null } | null> {
  try {
    const command = Command.create(cmdName, args);
    const output = await command.execute();
    return { stdout: output.stdout, stderr: output.stderr, code: output.code };
  } catch (err) {
    if (isMT5PythonCommandNotFoundError(err)) {
      logger.debug(`Commande "${cmdName}" introuvable, essai suivant…`);
      return null;
    }
    throw err;
  }
}

/**
 * Parse la sortie JSON du bridge pour la commande --mode history.
 *
 * Valide les champs minimaux (success, deals) avant de retourner.
 */
function parseHistoryOutput(stdout: string): MT5HistoryResult {
  const raw = stdout.trim();

  if (!raw) {
    return buildHistoryError(
      "SCRIPT_ERROR",
      "Le bridge n'a retourné aucune donnée. Vérifiez que Python fonctionne.",
    );
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MT5HistoryResult>;

    if (typeof parsed.success !== "boolean") {
      return buildHistoryError(
        "PARSE_ERROR",
        "La sortie du bridge ne contient pas les champs attendus.",
      );
    }

    // Garantir que deals est toujours un tableau
    if (!parsed.success) {
      return buildHistoryError(
        parsed.errorCode ?? "UNKNOWN_MT5_ERROR",
        parsed.message ?? "Erreur inconnue du bridge.",
        parsed.message,
      );
    }

    return {
      success: true,
      range: parsed.range,
      deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      totalDeals: parsed.totalDeals ?? 0,
      account: parsed.account,
      accountId: parsed.accountId,
      server: parsed.server,
      broker: parsed.broker,
      currency: parsed.currency,
      message: parsed.message ?? "",
    };
  } catch {
    return buildHistoryError(
      "PARSE_ERROR",
      `Le bridge a retourné une sortie non-JSON : ${raw.slice(0, 100)}`,
    );
  }
}

// ─── Point d'entrée public ────────────────────────────────

/**
 * Lit l'historique des deals MT5 sur une période donnée.
 *
 * LECTURE SEULE — aucun trade n'est importé dans SQLite à cette étape.
 * Les données retournées sont prévues pour la PRÉVISUALISATION uniquement.
 *
 * @param period   — "today" | "7d" | "30d" | "custom"
 * @param fromDate — requis si period = "custom" (format YYYY-MM-DD)
 * @param toDate   — optionnel si period = "custom" (défaut : aujourd'hui)
 *
 * @returns MT5HistoryResult — ne throw jamais
 *
 * @example
 *   // Charger les 30 derniers jours
 *   const result = await fetchMT5History("30d");
 *   if (result.success) {
 *     console.log(`${result.totalDeals} deals récupérés`);
 *     console.log(result.deals); // MT5RawDeal[]
 *   }
 *
 * @example
 *   // Plage personnalisée
 *   const result = await fetchMT5History("custom", "2026-01-01", "2026-03-31");
 */
export interface FetchMT5HistoryOptions {
  /** Chemin terminal MT5 cible pour environnement multi-instance. */
  terminalPath?: string;
}

export async function fetchMT5History(
  period: MT5HistoryPeriod = "30d",
  fromDate: string | null = null,
  toDate: string | null = null,
  options?: FetchMT5HistoryOptions,
): Promise<MT5HistoryResult> {
  logger.debug(`Chargement historique MT5 — période: ${period}, from: ${fromDate ?? "auto"}, to: ${toDate ?? "auto"}`);

  const dateRangeError = validateDateRange(period, fromDate, toDate);
  if (dateRangeError) {
    return buildHistoryError(
      "INVALID_DATE_RANGE",
      "La période personnalisée MT5 est invalide.",
      dateRangeError,
    );
  }

  // ── Résolution du chemin du script ───────────────────────
  let scriptPath: string;
  try {
    scriptPath = await resolveScriptPath();
    logger.debug(`Chemin du bridge : ${scriptPath}`);
  } catch (err) {
    logger.error(`Impossible de résoudre le chemin du bridge : ${String(err)}`);
    return buildHistoryError(
      "SCRIPT_ERROR",
      "Impossible de localiser le script bridge MT5.",
    );
  }

  const args = buildHistoryArgs(
    scriptPath,
    period,
    fromDate,
    toDate,
    options?.terminalPath ?? null,
  );
  logger.debug(`Arguments : ${args.join(" ")}`);

  // ── Timeout de sécurité ───────────────────────────────────
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), HISTORY_TIMEOUT_MS),
  );

  let rawOutput: { stdout: string; stderr: string; code: number | null } | null = null;
  let lastError: unknown = null;

  // ── Essai python → python3 (fallback Windows) ─────────────
  const commandOrder = getMT5PythonCommandOrder(preferredPythonCommand);

  for (const cmdName of commandOrder) {
    try {
      const execPromise = tryRunPythonWithArgs(cmdName, args);
      const result = await Promise.race([execPromise, timeoutPromise]);

      if (result === null && cmdName === "python") continue; // null = non trouvé
      if (result === null) break;                            // python3 aussi null

      rawOutput = result;
  preferredPythonCommand = cmdName;
      break;
    } catch (err) {
      lastError = err;
      logger.warn(`Erreur avec "${cmdName}" : ${String(err)}`);
      if (cmdName === "python") continue;
    }
  }

  // ── Python introuvable ────────────────────────────────────
  if (rawOutput === null && lastError === null) {
    logger.warn("Python introuvable dans le PATH système");
    return buildHistoryError(
      "PYTHON_NOT_FOUND",
      "Python n'est pas installé ou introuvable dans le PATH. " +
        "Vérifiez l'installation et réessayez.",
    );
  }

  if (rawOutput === null) {
    const isTimeout = lastError === null;
    logger.error(`Échec bridge : ${isTimeout ? "timeout" : String(lastError)}`);
    return buildHistoryError(
      isTimeout ? "TIMEOUT" : "SCRIPT_ERROR",
      isTimeout
        ? `Le bridge MT5 n'a pas répondu dans les ${HISTORY_TIMEOUT_MS / 1000}s. Réessayez.`
        : `Erreur lors de l'exécution du bridge : ${String(lastError)}`,
    );
  }

  // ── Log stderr si présent ─────────────────────────────────
  if (rawOutput.stderr.trim()) {
    logger.warn(`Bridge stderr : ${rawOutput.stderr.trim().slice(0, 500)}`);
  }

  // ── Code de sortie non nul sans stdout ───────────────────
  if (rawOutput.code !== 0 && !rawOutput.stdout.trim()) {
    logger.error(`Bridge exit code ${rawOutput.code ?? "null"} sans stdout`);
    return buildHistoryError(
      "SCRIPT_ERROR",
      `Le bridge a terminé avec le code ${rawOutput.code ?? "?"}.` +
        (rawOutput.stderr
          ? ` Erreur Python : ${rawOutput.stderr.trim().slice(0, 200)}`
          : ""),
    );
  }

  // ── Parse et retour ───────────────────────────────────────
  const historyResult = parseHistoryOutput(rawOutput.stdout);

  if (historyResult.success) {
    logger.info(
      `Historique chargé — ${historyResult.totalDeals} deal(s) ` +
        `(${historyResult.range?.from?.slice(0, 10) ?? "?"} → ` +
        `${historyResult.range?.to?.slice(0, 10) ?? "?"})`,
    );
  } else {
    logger.warn(
      `Échec lecture historique — code: ${historyResult.errorCode ?? "?"}, ` +
        `message: ${historyResult.message}`,
    );
  }

  return historyResult;
}
