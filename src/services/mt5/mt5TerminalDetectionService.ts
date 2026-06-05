// ============================================================
// MT5 Terminal Detection Service — TradingBook
// ============================================================
// Détecte automatiquement les terminaux MetaTrader 5 ouverts sur le système.
//
// FONCTIONNEMENT :
//   - Appelle mt5_bridge.py --mode detect
//   - Le bridge utilise PowerShell pour lister les processus terminal64.exe
//   - Retourne chemin + PID de chaque instance détectée
//
// RÈGLES DE SÉCURITÉ :
//   - Lecture seule — aucune connexion MT5, aucun ordre
//   - Aucun credential broker transmis
//   - Timeout 10 secondes (PowerShell process list = très rapide)
// ============================================================

import { Command } from "@tauri-apps/plugin-shell";
import { resourceDir, join } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import {
  getMT5PythonCommandOrder,
  isMT5PythonCommandNotFoundError,
  type MT5PythonCommandName,
} from "./mt5PythonShell";

const logger = createLogger("mt5-terminal-detection");
const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";
const DETECT_TIMEOUT_MS = 12_000;

let cachedScriptPathPromise: Promise<string> | null = null;
let preferredPythonCommand: MT5PythonCommandName | null = null;

// ─── Types ─────────────────────────────────────────────────

/** Un terminal MT5 détecté sur le système. */
export interface MT5TerminalInfo {
  /** Chemin absolu vers terminal64.exe */
  path: string;
  /** PID du processus Windows */
  pid: number;
}

/** Résultat de la détection des terminaux MT5 ouverts. */
export interface MT5DetectTerminalsResult {
  success: boolean;
  terminals: MT5TerminalInfo[];
  totalTerminals: number;
  errorCode?: string;
  message: string;
}

// ─── Helpers internes ──────────────────────────────────────

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

function buildError(
  errorCode: string,
  message: string,
): MT5DetectTerminalsResult {
  return { success: false, terminals: [], totalTerminals: 0, errorCode, message };
}

function parseDetectOutput(stdout: string): MT5DetectTerminalsResult {
  const raw = stdout.trim();

  if (!raw) {
    return buildError(
      "SCRIPT_ERROR",
      "Le bridge n'a retourné aucune donnée pour --mode detect.",
    );
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MT5DetectTerminalsResult>;

    if (typeof parsed.success !== "boolean") {
      return buildError("PARSE_ERROR", "Réponse bridge detect invalide.");
    }

    if (!parsed.success) {
      return buildError(
        parsed.errorCode ?? "UNKNOWN_MT5_ERROR",
        parsed.message ?? "Erreur inconnue.",
      );
    }

    const terminals: MT5TerminalInfo[] = Array.isArray(parsed.terminals)
      ? parsed.terminals.filter(
          (t): t is MT5TerminalInfo =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as { path?: unknown }).path === "string",
        )
      : [];

    return {
      success: true,
      terminals,
      totalTerminals: terminals.length,
      message: parsed.message ?? "",
    };
  } catch {
    return buildError(
      "PARSE_ERROR",
      `Impossible de parser la réponse detect : ${raw.slice(0, 120)}`,
    );
  }
}

async function tryRunDetect(
  cmdName: MT5PythonCommandName,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null } | null> {
  try {
    const command = Command.create(cmdName, args);
    const output = await command.execute();
    return { stdout: output.stdout, stderr: output.stderr, code: output.code };
  } catch (err) {
    if (isMT5PythonCommandNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

// ─── Fonction publique ──────────────────────────────────────

/**
 * Détecte automatiquement les terminaux MetaTrader 5 ouverts.
 *
 * Utilise PowerShell pour lister les processus terminal64.exe
 * et retourner leurs chemins d'installation.
 *
 * LECTURE SEULE — aucune connexion MT5, aucun ordre.
 * Ne throw jamais.
 *
 * @returns liste des terminaux détectés avec chemin et PID.
 */
export async function detectMT5Terminals(): Promise<MT5DetectTerminalsResult> {
  logger.debug("detectMT5Terminals() — mode detect");

  let scriptPath: string;
  try {
    scriptPath = await resolveScriptPath();
  } catch (err) {
    return buildError(
      "SCRIPT_ERROR",
      `Impossible de localiser le script bridge : ${String(err)}`,
    );
  }

  const args = [scriptPath, "--mode", "detect"];

  const timeoutPromise = new Promise<MT5DetectTerminalsResult>((resolve) =>
    setTimeout(
      () =>
        resolve(
          buildError(
            "TIMEOUT",
            `Détection MT5 : pas de réponse dans les ${DETECT_TIMEOUT_MS / 1000}s.`,
          ),
        ),
      DETECT_TIMEOUT_MS,
    ),
  );

  const executionPromise = (async (): Promise<MT5DetectTerminalsResult> => {
    const commandOrder = getMT5PythonCommandOrder(preferredPythonCommand);

    let output: { stdout: string; stderr: string; code: number | null } | null = null;

    for (const cmdName of commandOrder) {
      output = await tryRunDetect(cmdName, args).catch((err: unknown) => {
        logger.error(`Erreur ${cmdName} detect : ${String(err)}`);
        return null;
      });

      if (output !== null) {
        preferredPythonCommand = cmdName;
        break;
      }
    }

    if (output === null) {
      return buildError(
        "PYTHON_NOT_FOUND",
        "Python introuvable. Installez Python 3.8+.",
      );
    }

    if (output.stderr.trim()) {
      logger.debug(`Detect stderr : ${output.stderr.trim()}`);
    }

    const result = parseDetectOutput(output.stdout);

    if (result.success) {
      logger.info(
        `Terminaux MT5 détectés : ${result.totalTerminals} — ${result.terminals.map((t) => t.path).join(", ")}`,
      );
    } else {
      logger.warn(`Detect erreur [${result.errorCode ?? "?"}] : ${result.message}`);
    }

    return result;
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}
