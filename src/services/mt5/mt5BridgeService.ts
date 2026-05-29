// ============================================================
// MT5 Bridge Service — TradingBook
// ============================================================
// Phase 6 Étape 2 — Exécution du script Python local mt5_bridge.py
// via tauri-plugin-shell.
//
// RESPONSABILITÉS :
//   - Résoudre le chemin du script Python bundlé (ressource Tauri)
//   - Exécuter le script via Command.create() (tauri-plugin-shell)
//   - Parser la sortie JSON du bridge
//   - Retourner un résultat typé MT5BridgeCheckResult
//   - Gérer toutes les erreurs (Python absent, MT5 fermé, JSON invalide)
//
// FLUX D'EXÉCUTION :
//   1. resolveScriptPath()     — chemin absolu vers mt5_bridge.py
//   2. runPython(scriptPath)   — exécute python mt5_bridge.py --mode check
//   3. parseBridgeOutput()     — JSON.parse(stdout) → MT5BridgeCheckResult
//   4. Retourne le résultat (succès ou erreur structurée)
//
// RÈGLES DE SÉCURITÉ :
//   - Le script Python est en LECTURE SEULE (aucun ordre, aucune écriture)
//   - Aucun credential broker n'est transmis au script
//   - La sortie est parsée et validée avant utilisation
//   - Les erreurs non récupérées n'exposent pas de stack trace à l'utilisateur
//
// DÉPENDANCES :
//   - tauri-plugin-shell (npm + Cargo) — pour Command.create()
//   - @tauri-apps/api/path            — pour resourceDir() + join()
//   - src-tauri/resources/mt5_bridge.py — script Python bundlé
// ============================================================

import { Command } from "@tauri-apps/plugin-shell";
import { resourceDir, join } from "@tauri-apps/api/path";
import { createLogger } from "../logging";
import { buildMT5ResultError } from "./mt5ErrorService";
import type { MT5BridgeCheckResult, MT5CheckErrorCode } from "../../types/mt5";

const logger = createLogger("mt5-bridge");

// ─── Constantes ────────────────────────────────────────────

/** Nom du fichier script Python tel que bundlé dans les ressources Tauri. */
const BRIDGE_SCRIPT_NAME = "mt5_bridge.py";

/** Timeout du script Python en millisecondes (30 secondes). */
const BRIDGE_TIMEOUT_MS = 30_000;

// Cache runtime pour eviter appels Tauri repetes a chaque verification MT5.
let cachedScriptPathPromise: Promise<string> | null = null;
// 'py' = Windows Python Launcher (vrai exécutable, pas un alias Microsoft Store)
let preferredPythonCommand: "python" | "python3" | "py" | null = null;

// ─── Helpers ───────────────────────────────────────────────

/**
 * Résout le chemin absolu du script bridge Python.
 *
 * En production (app bundlée), le script est dans le dossier resources/ de
 * l'installation Tauri. En développement, Tauri sert les ressources depuis
 * src-tauri/resources/.
 *
 * @returns Chemin absolu vers mt5_bridge.py
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
      // Fallback pour le cas où resourceDir() échoue (rare)
      logger.warn(`resolveScriptPath fallback : ${String(err)}`);
      return BRIDGE_SCRIPT_NAME;
    }
  })();

  return cachedScriptPathPromise;
}

/**
 * Construit un résultat d'erreur structuré.
 * Utilisé pour normaliser toutes les erreurs vers MT5BridgeCheckResult.
 */
function buildError(
  errorCode: MT5CheckErrorCode,
  message: string,
  technicalDetails: unknown = message,
): MT5BridgeCheckResult {
  const error = buildMT5ResultError({
    code: errorCode,
    message,
    technicalDetails,
    context: "bridge-check",
  });

  return {
    success: false,
    terminalConnected: false,
    errorCode: error.errorCode,
    message: error.message,
  };
}

/**
 * Tente d'exécuter le script Python avec le nom de commande Tauri donné.
 *
 * Le nom de commande ("python" ou "python3") correspond à l'entrée de scope
 * dans capabilities/default.json. Sur Windows, "python" est généralement
 * disponible ; "python3" sert de fallback pour certaines configurations
 * (ex: Python installé via le Microsoft Store).
 *
 * @param cmdName   — nom de la commande dans le scope Tauri ("python" | "python3" | "py")
 * @param scriptPath — chemin absolu vers mt5_bridge.py
 * @returns stdout du script, ou null si la commande n'est pas trouvée
 * @throws Si une erreur non liée à "commande introuvable" survient
 */
async function tryRunPython(
  cmdName: "python" | "python3" | "py",
  scriptPath: string,
): Promise<{ stdout: string; stderr: string; code: number | null } | null> {
  try {
    const command = Command.create(cmdName, [scriptPath, "--mode", "check"]);
    const output = await command.execute();
    return {
      stdout: output.stdout,
      stderr: output.stderr,
      code: output.code,
    };
  } catch (err) {
    // Détecter "commande introuvable" pour déclencher le fallback python3
    const msg = String(err).toLowerCase();
    const isNotFound =
      msg.includes("not found") ||
      msg.includes("cannot find") ||
      msg.includes("no such file") ||
      msg.includes("os error 2") ||        // POSIX: no such file
      msg.includes("the system cannot");   // Windows: commande introuvable

    if (isNotFound) {
      logger.debug(`Commande "${cmdName}" introuvable, essai suivant…`);
      return null; // Signal : essayer le nom suivant
    }

    // Autre erreur (permissions, timeout, etc.) → remonter
    throw err;
  }
}

/**
 * Parse la sortie JSON du script Python bridge.
 *
 * Valide que la sortie contient les champs minimaux attendus avant de
 * retourner le résultat. Si la sortie est vide ou invalide, retourne
 * une erreur PARSE_ERROR.
 *
 * @param stdout — sortie brute du script Python
 * @returns MT5BridgeCheckResult parsé et validé
 */
function parseBridgeOutput(stdout: string): MT5BridgeCheckResult {
  const raw = stdout.trim();

  if (!raw) {
    return buildError(
      "SCRIPT_ERROR",
      "Le script bridge n'a retourné aucune donnée. Vérifiez que Python fonctionne correctement.",
    );
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MT5BridgeCheckResult>;

    // Validation minimale : success et message sont obligatoires
    if (typeof parsed.success !== "boolean") {
      return buildError(
        "PARSE_ERROR",
        "La sortie du bridge ne contient pas les champs attendus.",
      );
    }

    // Retourner le résultat tel que fourni par Python
    if (!parsed.success) {
      const error = buildMT5ResultError({
        code: parsed.errorCode,
        message: parsed.message,
        technicalDetails: parsed.message,
        context: "bridge-check-python",
      });
      return {
        ...parsed,
        success: false,
        terminalConnected: false,
        errorCode: error.errorCode,
        message: error.message,
      };
    }

    return parsed as MT5BridgeCheckResult;
  } catch {
    return buildError(
      "PARSE_ERROR",
      `Le bridge a retourné une sortie invalide (non-JSON) : ${raw.slice(0, 100)}`,
    );
  }
}

// ─── Point d'entrée public ────────────────────────────────

/**
 * Lance le bridge Python et vérifie la disponibilité de MetaTrader 5.
 *
 * Séquence :
 *   1. Résout le chemin du script Python bundlé
 *   2. Essaie d'abord "python", puis "python3" comme fallback
 *   3. Parse la sortie JSON du bridge
 *   4. Log le résultat et les erreurs éventuelles
 *   5. Retourne un MT5BridgeCheckResult normalisé
 *
 * JAMAIS de throw — toutes les erreurs sont encapsulées dans le résultat.
 * L'UI n'a qu'à lire result.success pour savoir si tout va bien.
 *
 * @returns Résultat typé de la vérification MT5
 */
export async function checkMT5Connection(): Promise<MT5BridgeCheckResult> {
  logger.debug("Lancement de la vérification MT5…");

  // ── Résolution du chemin du script ───────────────────────
  let scriptPath: string;
  try {
    scriptPath = await resolveScriptPath();
    logger.debug(`Chemin du bridge : ${scriptPath}`);
  } catch (err) {
    logger.error(`Impossible de résoudre le chemin du bridge : ${String(err)}`);
    return buildError(
      "SCRIPT_ERROR",
      "Impossible de localiser le script bridge MT5. L'application doit être reconstruite.",
    );
  }

  // ── Exécution : python → python3 comme fallback ──────────

  // Timeout via Promise.race pour éviter un blocage de l'UI
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), BRIDGE_TIMEOUT_MS),
  );

  let rawOutput: { stdout: string; stderr: string; code: number | null } | null = null;
  let lastError: unknown = null;

  const commandOrder =
    preferredPythonCommand === null
      // Ordre : python → python3 → py (Windows Python Launcher, fallback fiable sur Windows)
      ? (["python", "python3", "py"] as const)
      : ([
          preferredPythonCommand,
          preferredPythonCommand === "python"
            ? "python3"
            : preferredPythonCommand === "python3"
              ? "py"
              : "python",
          preferredPythonCommand === "python"
            ? "py"
            : preferredPythonCommand === "python3"
              ? "python"
              : "python3",
        ] as const);

  for (const cmdName of commandOrder) {
    try {
      const execPromise = tryRunPython(cmdName, scriptPath);
      const result = await Promise.race([execPromise, timeoutPromise]);

      if (result === null) {
        // Commande introuvable → essayer la suivante
        continue;
      }

      rawOutput = result;
      preferredPythonCommand = cmdName;
      break;
    } catch (err) {
      lastError = err;
      logger.warn(`Erreur avec "${cmdName}" : ${String(err)}`);
      // Continuer avec la commande suivante
    }
  }

  // ── Python introuvable (ni python ni python3) ─────────────
  if (rawOutput === null && lastError === null) {
    logger.warn("Python introuvable dans le PATH système");
    return buildError(
      "PYTHON_NOT_FOUND",
      "Python n'est pas installé ou introuvable. " +
        "Téléchargez Python 3.8+ sur https://python.org, " +
        "puis installez MetaTrader5 : pip install MetaTrader5",
    );
  }

  if (rawOutput === null) {
    // Timeout ou erreur inattendue
    const isTimeout = lastError === null;
    logger.error(`Échec bridge : ${isTimeout ? "timeout" : String(lastError)}`);
    return buildError(
      isTimeout ? "TIMEOUT" : "SCRIPT_ERROR",
      isTimeout
        ? `Le bridge MT5 n'a pas répondu dans les ${BRIDGE_TIMEOUT_MS / 1000} secondes.`
        : `Erreur inattendue lors de l'exécution du bridge : ${String(lastError)}`,
    );
  }

  // ── Log stderr si présent ─────────────────────────────────
  if (rawOutput.stderr.trim()) {
    logger.warn(`Bridge stderr : ${rawOutput.stderr.trim().slice(0, 500)}`);
  }

  // ── Code de sortie non nul ────────────────────────────────
  // On essaie quand même de parser stdout — le script Python
  // peut avoir mis un JSON d'erreur dans stdout ET exit(1)
  if (rawOutput.code !== 0 && !rawOutput.stdout.trim()) {
    logger.error(`Bridge exit code ${rawOutput.code ?? "null"} sans stdout`);
    return buildError(
      "SCRIPT_ERROR",
      `Le bridge a terminé avec le code d'erreur ${rawOutput.code ?? "?"}.` +
        (rawOutput.stderr
          ? ` Erreur Python : ${rawOutput.stderr.trim().slice(0, 200)}`
          : ""),
    );
  }

  // ── Parse de la sortie JSON ───────────────────────────────
  const checkResult = parseBridgeOutput(rawOutput.stdout);

  // ── Logging du résultat ───────────────────────────────────
  if (checkResult.success) {
    logger.info(
      `MT5 connecté — compte ${checkResult.account ?? "?"}, ` +
        `serveur ${checkResult.server ?? "?"}, ` +
        `broker ${checkResult.company ?? "?"}`,
    );
  } else {
    logger.warn(
      `MT5 non disponible — code : ${checkResult.errorCode ?? "?"}, ` +
        `message : ${checkResult.message}`,
    );
  }

  return checkResult;
}

// ─── Helpers UI ───────────────────────────────────────────

/**
 * Retourne les instructions d'installation contextuelle
 * selon le code d'erreur reçu du bridge.
 *
 * Utilisé par MT5SyncPage pour afficher une aide actionnable
 * à l'utilisateur sans lui exposer les détails techniques bruts.
 */
export function getMT5InstallationSteps(
  errorCode: string | undefined,
): Array<{ title: string; command?: string }> {
  switch (errorCode) {
    case "PYTHON_NOT_FOUND":
      return [
        {
          title: "1. Installer Python 3.8 ou supérieur",
          command: "https://python.org/downloads",
        },
        {
          title: "2. Installer la bibliothèque MetaTrader5",
          command: "pip install MetaTrader5",
        },
        {
          title: "3. Relancer TradingBook et cliquer sur Vérifier",
        },
      ];
    case "MT5_LIB_MISSING":
      return [
        {
          title: "1. Ouvrir un terminal (cmd ou PowerShell)",
        },
        {
          title: "2. Installer la bibliothèque MetaTrader5",
          command: "pip install MetaTrader5",
        },
        {
          title: "3. Cliquer à nouveau sur Vérifier",
        },
      ];
    case "MT5_NOT_RUNNING":
    case "MT5_NOT_CONNECTED":
      return [
        {
          title: "1. Ouvrir MetaTrader 5",
        },
        {
          title: "2. Se connecter à votre compte Fusion Markets",
        },
        {
          title: "3. Cliquer sur Vérifier dans TradingBook",
        },
      ];
    default:
      return [
        {
          title: "1. Vérifier que Python et MetaTrader5 sont installés",
          command: "pip install MetaTrader5",
        },
        {
          title: "2. Vérifier que MetaTrader 5 est ouvert",
        },
        {
          title: "3. Consulter les logs TradingBook si l'erreur persiste",
        },
      ];
  }
}
