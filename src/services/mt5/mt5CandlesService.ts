// ============================================================
// MT5 Candles Service — TradingBook
// ============================================================
// Lit chandelles OHLC MT5 via bridge Python en lecture seule.
// Sert uniquement replay/analytics local-first.
// ============================================================

import { Command } from "@tauri-apps/plugin-shell";
import { resourceDir, join } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import { buildMT5ResultError } from "./mt5ErrorService";
import type { ChartTimeframe, MT5CandlesResult, MT5CheckErrorCode } from "../../types";

const logger = createLogger("mt5-candles");

const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";
const CANDLES_TIMEOUT_MS = 20_000;

let cachedScriptPathPromise: Promise<string> | null = null;
let preferredPythonCommand: "python" | "python3" | null = null;

interface FetchMT5CandlesOptions {
  symbol: string;
  timeframe: ChartTimeframe;
  fromIso: string;
  toIso: string;
  maxBars?: number;
}

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

function buildCandlesError(
  errorCode: MT5CheckErrorCode,
  message: string,
  technicalDetails: unknown = message,
): MT5CandlesResult {
  const error = buildMT5ResultError({
    code: errorCode,
    message,
    technicalDetails,
    context: "candles",
  });

  return {
    success: false,
    candles: [],
    totalCandles: 0,
    errorCode: error.errorCode,
    message: error.message,
  };
}

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

function parseCandlesOutput(stdout: string): MT5CandlesResult {
  const raw = stdout.trim();

  if (!raw) {
    return buildCandlesError(
      "SCRIPT_ERROR",
      "Le bridge n'a retourné aucune donnée candles.",
    );
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MT5CandlesResult>;

    if (typeof parsed.success !== "boolean") {
      return buildCandlesError(
        "PARSE_ERROR",
        "La sortie du bridge candles est invalide.",
      );
    }

    if (!parsed.success) {
      return buildCandlesError(
        parsed.errorCode ?? "UNKNOWN_MT5_ERROR",
        parsed.message ?? "Erreur inconnue du bridge candles.",
        parsed.message,
      );
    }

    return {
      success: true,
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      range: parsed.range,
      candles: Array.isArray(parsed.candles) ? parsed.candles : [],
      totalCandles:
        typeof parsed.totalCandles === "number" ? parsed.totalCandles : 0,
      account: parsed.account,
      accountId: parsed.accountId,
      server: parsed.server,
      broker: parsed.broker,
      currency: parsed.currency,
      message: parsed.message ?? "",
    };
  } catch {
    return buildCandlesError(
      "PARSE_ERROR",
      `Le bridge candles a retourné un JSON invalide : ${raw.slice(0, 120)}`,
    );
  }
}

/**
 * Lit chandelles OHLC MT5 locales dans plage temporelle donnee.
 * Ne throw jamais: retourne objet succès/erreur typé.
 */
export async function fetchMT5Candles(
  options: FetchMT5CandlesOptions,
): Promise<MT5CandlesResult> {
  const symbol = options.symbol.trim().toUpperCase();
  if (!symbol) {
    return buildCandlesError("INVALID_PERIOD", "Symbole MT5 manquant.");
  }

  logger.debug(
    `fetchMT5Candles symbol=${symbol} tf=${options.timeframe} from=${options.fromIso} to=${options.toIso}`,
  );

  let scriptPath: string;
  try {
    scriptPath = await resolveScriptPath();
  } catch (err) {
    return buildCandlesError(
      "SCRIPT_ERROR",
      `Impossible de localiser le bridge MT5 candles : ${String(err)}`,
    );
  }

  const args = [
    scriptPath,
    "--mode",
    "candles",
    "--symbol",
    symbol,
    "--timeframe",
    options.timeframe,
    "--from",
    options.fromIso,
    "--to",
    options.toIso,
    "--max-bars",
    String(Math.max(100, Math.min(options.maxBars ?? 2000, 20_000))),
  ];

  const timeoutPromise = new Promise<MT5CandlesResult>((resolve) =>
    setTimeout(
      () =>
        resolve(
          buildCandlesError(
            "TIMEOUT",
            `Le bridge candles n'a pas répondu en ${CANDLES_TIMEOUT_MS / 1000}s.`,
          ),
        ),
      CANDLES_TIMEOUT_MS,
    ),
  );

  const executionPromise = (async (): Promise<MT5CandlesResult> => {
    const commandOrder =
      preferredPythonCommand === null
        ? (["python", "python3"] as const)
        : ([
            preferredPythonCommand,
            preferredPythonCommand === "python" ? "python3" : "python",
          ] as const);

    let output: { stdout: string; stderr: string; code: number | null } | null = null;

    for (const cmdName of commandOrder) {
      try {
        output = await tryRunPythonWithArgs(cmdName, args);
        if (output !== null) {
          preferredPythonCommand = cmdName;
          break;
        }
      } catch (err) {
        logger.warn(`Erreur ${cmdName} candles : ${String(err)}`);
      }
    }

    if (output === null) {
      return buildCandlesError(
        "PYTHON_NOT_FOUND",
        "Python introuvable pour lecture candles MT5.",
      );
    }

    if (output.stderr.trim()) {
      logger.debug(`Bridge candles stderr : ${output.stderr.trim().slice(0, 300)}`);
    }

    if (output.code !== 0 && !output.stdout.trim()) {
      return buildCandlesError(
        "SCRIPT_ERROR",
        `Bridge candles terminé avec code ${String(output.code)} sans sortie JSON.`,
      );
    }

    return parseCandlesOutput(output.stdout);
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}
