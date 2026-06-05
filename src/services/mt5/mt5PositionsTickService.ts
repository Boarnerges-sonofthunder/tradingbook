// ============================================================
// MT5 Positions Tick Stream Service — TradingBook
// ============================================================
// Stream NDJSON des positions ouvertes depuis mt5_bridge.py --mode positions-stream.
// Utilise process long-vivant via tauri-plugin-shell pour recevoir mises a jour
// a chaque tick detecte sans relancer Python a intervalle fixe cote UI.
// ============================================================

import { Command, type Child } from "@tauri-apps/plugin-shell";
import { join, resourceDir } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import {
  getMT5PythonCommandOrder,
  isMT5PythonCommandNotFoundError,
  type MT5PythonCommandName,
} from "./mt5PythonShell";
import type { MT5PositionsResult } from "../../types/mt5";

const logger = createLogger("mt5-positions-tick");

const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";
let cachedScriptPathPromise: Promise<string> | null = null;
let preferredPythonCommand: MT5PythonCommandName | null = null;

export interface MT5PositionsTickEvent extends MT5PositionsResult {
  streamEvent?: string;
}

export interface StartMT5PositionsTickStreamOptions {
  tickPollMs: number;
  /** Chemin terminal MT5 cible pour environnement multi-instance. */
  terminalPath?: string;
  onTick: (event: MT5PositionsTickEvent) => void;
  onFatalError?: (message: string) => void;
  onClose?: (payload: { code: number | null; signal: number | null }) => void;
}

export interface MT5PositionsTickStreamController {
  stop: () => Promise<void>;
  isActive: () => boolean;
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

function parseTickEventLine(line: string): MT5PositionsTickEvent | null {
  const raw = line.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MT5PositionsTickEvent>;
    if (typeof parsed.success !== "boolean") return null;

    return {
      success: parsed.success,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      totalPositions:
        typeof parsed.totalPositions === "number" ? parsed.totalPositions : 0,
      account: parsed.account,
      accountId: parsed.accountId,
      server: parsed.server,
      broker: parsed.broker,
      currency: parsed.currency,
      errorCode: parsed.errorCode,
      message: parsed.message ?? "",
      streamEvent: parsed.streamEvent,
    };
  } catch {
    logger.warn(`Ligne tick JSON invalide ignoree: ${raw.slice(0, 140)}`);
    return null;
  }
}

async function trySpawnStream(
  commandName: MT5PythonCommandName,
  args: string[],
  options: StartMT5PositionsTickStreamOptions,
): Promise<MT5PositionsTickStreamController | null> {
  const command = Command.create(commandName, args);

  let stdoutBuffer = "";
  let childRef: Child | null = null;
  let active = true;

  command.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseTickEventLine(line);
      if (event !== null) {
        options.onTick(event);
      }
    }
  });

  command.stderr.on("data", (line) => {
    const msg = String(line).trim();
    if (msg) {
      logger.debug(`tick stream stderr: ${msg.slice(0, 300)}`);
    }
  });

  command.on("error", (message) => {
    logger.error(`tick stream command error: ${message}`);
    options.onFatalError?.(message);
  });

  command.on("close", (payload) => {
    active = false;

    // Tenter parser dernier fragment stdout si contient ligne JSON complete sans newline final.
    const tail = parseTickEventLine(stdoutBuffer);
    if (tail !== null) {
      options.onTick(tail);
    }
    stdoutBuffer = "";

    options.onClose?.(payload);
  });

  try {
    childRef = await command.spawn();
    logger.info(
      `Stream positions MT5 demarre via ${commandName} (pid=${childRef.pid})`,
    );
  } catch (err) {
    command.removeAllListeners();
    command.stdout.removeAllListeners();
    command.stderr.removeAllListeners();

    if (isMT5PythonCommandNotFoundError(err)) {
      logger.debug(`Commande ${commandName} introuvable pour stream tick.`);
      return null;
    }

    throw err;
  }

  return {
    async stop() {
      if (!active) return;
      active = false;

      command.removeAllListeners();
      command.stdout.removeAllListeners();
      command.stderr.removeAllListeners();

      if (childRef !== null) {
        try {
          await childRef.kill();
        } catch (err) {
          logger.debug(`stop stream tick ignore: ${String(err)}`);
        }
      }
    },
    isActive() {
      return active;
    },
  };
}

export async function startMT5PositionsTickStream(
  options: StartMT5PositionsTickStreamOptions,
): Promise<MT5PositionsTickStreamController> {
  const scriptPath = await resolveScriptPath();

  const normalizedPollMs = Math.max(50, Math.min(2_000, Math.round(options.tickPollMs)));
  const args = [
    scriptPath,
    "--mode",
    "positions-stream",
    "--tick-poll-ms",
    String(normalizedPollMs),
  ];
  const terminalPath = options.terminalPath?.trim();
  if (terminalPath) {
    args.push("--terminal-path", terminalPath);
  }

  const commandOrder = getMT5PythonCommandOrder(preferredPythonCommand);
  for (const commandName of commandOrder) {
    const controller = await trySpawnStream(commandName, args, options);
    if (controller !== null) {
      preferredPythonCommand = commandName;
      return controller;
    }
  }

  throw new Error(
    "Python introuvable dans le PATH systeme. Installez Python 3.8+.",
  );
}
