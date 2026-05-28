// ============================================================
// MT5 Open Positions Service — TradingBook
// ============================================================
// Phase 6 Étape 4 — Lecture des positions actuellement ouvertes.
//
// RESPONSABILITÉS :
//   - Exécuter mt5_bridge.py --mode positions
//   - Parser et valider la sortie JSON
//   - Retourner un MT5PositionsResult typé
//   - Gérer toutes les erreurs sans jamais throw
//
// CE QUE CE SERVICE NE FAIT PAS (Étape 5+) :
//   - Mapper les positions vers les trades TradingBook
//   - Importer dans SQLite
//   - Rafraîchissement automatique (polling)
//
// FLUX D'EXÉCUTION :
//   1. resolveScriptPath()      — chemin absolu vers mt5_bridge.py
//   2. tryRunPythonWithArgs()   — exécute python mt5_bridge.py --mode positions
//     (fallback python → python3 si introuvable)
//   3. parsePositionsOutput()   — JSON.parse(stdout) → MT5PositionsResult
//   4. Retourne le résultat (ou erreur structurée)
//
// RÈGLES DE SÉCURITÉ :
//   - LECTURE SEULE — aucun ordre, aucune écriture SQLite
//   - Aucun credential broker transmis
//   - Timeout 15 secondes (positions = lecture rapide, pas de plage de dates)
// ============================================================

import { Command } from "@tauri-apps/plugin-shell";
import { resourceDir, join } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import { buildMT5ResultError } from "./mt5ErrorService";
import type { MT5PositionsResult, MT5CheckErrorCode } from "../../types/mt5";

const logger = createLogger("mt5-positions");

// ─── Constantes ────────────────────────────────────────────

const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";

/** Timeout pour la lecture des positions (15 s — rapide, pas de plage de dates). */
const POSITIONS_TIMEOUT_MS = 15_000;

// Cache runtime pour limiter appels resourceDir/join + fallback python repetes.
let cachedScriptPathPromise: Promise<string> | null = null;
let preferredPythonCommand: "python" | "python3" | null = null;

// ─── Helpers internes ──────────────────────────────────────

/** Résout le chemin absolu vers le script bridge Python. */
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

/** Construit un résultat d'erreur structuré pour MT5PositionsResult. */
function buildPositionsError(
  errorCode: MT5CheckErrorCode,
  message: string,
  technicalDetails: unknown = message,
): MT5PositionsResult {
  const error = buildMT5ResultError({
    code: errorCode,
    message,
    technicalDetails,
    context: "positions",
  });

  return {
    success: false,
    positions: [],
    totalPositions: 0,
    errorCode: error.errorCode,
    message: error.message,
  };
}

/**
 * Tente d'exécuter le bridge Python avec le nom de commande Tauri donné.
 * Retourne null si la commande n'est pas dans le PATH (signal de fallback).
 */
async function tryRunPythonWithArgs(
  cmdName: "python" | "python3",
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null } | null> {
  try {
    const command = Command.create(cmdName, args);
    const output = await command.execute();
    return { stdout: output.stdout, stderr: output.stderr, code: output.code };
  } catch (err) {
    const msg = String(err).toLowerCase();
    const isNotFound =
      msg.includes("not found") ||
      msg.includes("cannot find") ||
      msg.includes("no such file") ||
      msg.includes("os error 2") ||
      msg.includes("the system cannot");

    if (isNotFound) {
      logger.debug(`Commande "${cmdName}" introuvable, essai suivant…`);
      return null;
    }
    throw err;
  }
}

/**
 * Parse la sortie JSON du bridge pour la commande --mode positions.
 * Valide les champs minimaux (success, positions) avant de retourner.
 */
function parsePositionsOutput(stdout: string): MT5PositionsResult {
  const raw = stdout.trim();

  if (!raw) {
    return buildPositionsError(
      "SCRIPT_ERROR",
      "Le bridge n'a retourné aucune donnée. Vérifiez que Python fonctionne.",
    );
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MT5PositionsResult>;

    if (typeof parsed.success !== "boolean") {
      return buildPositionsError(
        "PARSE_ERROR",
        "La sortie du bridge ne contient pas les champs attendus.",
      );
    }

    if (!parsed.success) {
      return buildPositionsError(
        parsed.errorCode ?? "UNKNOWN_MT5_ERROR",
        parsed.message ?? "Erreur inconnue du bridge.",
        parsed.message,
      );
    }

    return {
      success: true,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      totalPositions:
        typeof parsed.totalPositions === "number" ? parsed.totalPositions : 0,
      account: parsed.account,
      accountId: parsed.accountId,
      server: parsed.server,
      broker: parsed.broker,
      currency: parsed.currency,
      message: parsed.message ?? "",
    };
  } catch {
    const excerpt = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
    return buildPositionsError(
      "PARSE_ERROR",
      `Impossible de parser la réponse du bridge MT5 : ${excerpt}`,
    );
  }
}

// ─── Fonction publique ──────────────────────────────────────

/**
 * Lit les positions actuellement ouvertes dans MetaTrader 5.
 *
 * LECTURE SEULE — aucun ordre ne peut être passé via ce service.
 *
 * Ne throw jamais. Toutes les erreurs sont encapsulées dans MT5PositionsResult.
 *
 * @returns MT5PositionsResult avec les positions ouvertes ou une erreur typée.
 */
export async function fetchMT5Positions(): Promise<MT5PositionsResult> {
  logger.debug("fetchMT5Positions() démarré — mode positions");

  // ── Résoudre le chemin du script ───────────────────────────────────────
  let scriptPath: string;
  try {
    scriptPath = await resolveScriptPath();
    logger.debug(`Script bridge : ${scriptPath}`);
  } catch (err) {
    logger.error(`Impossible de résoudre le chemin du script : ${String(err)}`);
    return buildPositionsError(
      "SCRIPT_ERROR",
      `Impossible de localiser le script bridge MT5 : ${String(err)}`,
    );
  }

  const args = [scriptPath, "--mode", "positions"];

  // ── Timeout via Promise.race ───────────────────────────────────────────
  const timeoutPromise = new Promise<MT5PositionsResult>((resolve) =>
    setTimeout(
      () =>
        resolve(
          buildPositionsError(
            "TIMEOUT",
            `Le bridge MT5 n'a pas répondu dans les ${POSITIONS_TIMEOUT_MS / 1000} secondes.`,
          ),
        ),
      POSITIONS_TIMEOUT_MS,
    ),
  );

  const executionPromise = (async (): Promise<MT5PositionsResult> => {
    // ── Essai python (Windows) ─────────────────────────────────────────
    const commandOrder =
      preferredPythonCommand === null
        ? (["python", "python3"] as const)
        : ([
            preferredPythonCommand,
            preferredPythonCommand === "python" ? "python3" : "python",
          ] as const);

    let output: { stdout: string; stderr: string; code: number | null } | null = null;

    for (const cmdName of commandOrder) {
      output = await tryRunPythonWithArgs(cmdName, args).catch((err: unknown) => {
        logger.error(`Erreur ${cmdName} : ${String(err)}`);
        return null;
      });

      if (output !== null) {
        preferredPythonCommand = cmdName;
        break;
      }
    }

    if (output === null) {
      return buildPositionsError(
        "PYTHON_NOT_FOUND",
        "Python introuvable dans le PATH système. " +
          "Installez Python 3.8+ et assurez-vous qu'il est accessible.",
      );
    }

    // ── Log stderr pour débogage ──────────────────────────────────────
    if (output.stderr.trim()) {
      logger.debug(`Bridge stderr : ${output.stderr.trim()}`);
    }

    // ── Erreur de code de sortie ──────────────────────────────────────
    if (output.code !== 0 && !output.stdout.trim()) {
      const stderrExcerpt = output.stderr.trim().slice(0, 200);
      logger.error(`Bridge exit code ${String(output.code)} : ${stderrExcerpt}`);
      return buildPositionsError(
        "SCRIPT_ERROR",
        `Le bridge a terminé avec le code d'erreur ${String(output.code)}. ` +
          (stderrExcerpt ? `Erreur Python : ${stderrExcerpt}` : ""),
      );
    }

    // ── Parser la sortie ──────────────────────────────────────────────
    const result = parsePositionsOutput(output.stdout);

    if (result.success) {
      logger.info(
        `Positions lues : ${result.totalPositions} position(s) ouverte(s).`,
      );
    } else {
      logger.warn(
        `Bridge positions erreur [${result.errorCode ?? "?"}] : ${result.message}`,
      );
    }

    return result;
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}
