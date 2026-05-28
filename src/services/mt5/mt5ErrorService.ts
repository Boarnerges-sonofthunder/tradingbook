// ============================================================
// MT5 Error Service - TradingBook
// ============================================================
// Normalizes MT5, Python and bridge failures into typed error codes.
// The UI receives simple French messages. Technical details are logged
// locally through the existing TradingBook logger.
// ============================================================

import { createLogger } from "../logging";
import {
  MT5_ERROR_CODES,
  type MT5ErrorCode,
  type MT5ErrorInput,
  type MT5UserAction,
  type MT5UserFacingError,
} from "../../types/mt5Errors";

const logger = createLogger("mt5-error");

type MT5ErrorDefinition = Omit<MT5UserFacingError, "code" | "technicalDetails">;

const ERROR_DEFINITIONS: Record<MT5ErrorCode, MT5ErrorDefinition> = {
  MT5_NOT_INSTALLED: {
    title: "MetaTrader 5 introuvable",
    message:
      "MetaTrader 5 ne semble pas installé sur cet ordinateur. Installez-le, ouvrez-le, puis réessayez.",
    severity: "error",
    actions: [
      { title: "Installer MetaTrader 5" },
      { title: "Ouvrir MT5 et se connecter au compte broker" },
      { title: "Relancer la vérification dans TradingBook" },
    ],
  },
  MT5_NOT_RUNNING: {
    title: "MetaTrader 5 fermé",
    message:
      "MetaTrader 5 n’est pas ouvert. Veuillez ouvrir MT5 et vous connecter à votre compte, puis réessayez.",
    severity: "warning",
    actions: [
      { title: "Ouvrir MetaTrader 5" },
      { title: "Se connecter au compte broker" },
      { title: "Cliquer à nouveau sur Vérifier" },
    ],
  },
  MT5_NOT_CONNECTED: {
    title: "Compte MT5 non connecté",
    message:
      "MetaTrader 5 est ouvert, mais le compte broker n’est pas connecté. Connectez-vous dans MT5, puis réessayez.",
    severity: "warning",
    actions: [
      { title: "Vérifier la connexion internet" },
      { title: "Se connecter au serveur broker dans MT5" },
      { title: "Relancer la synchronisation" },
    ],
  },
  MT5_TERMINAL_UNREACHABLE: {
    title: "Terminal MT5 inaccessible",
    message:
      "TradingBook n’arrive pas à dialoguer avec le terminal MT5. Redémarrez MT5, puis réessayez.",
    severity: "error",
    actions: [
      { title: "Redémarrer MetaTrader 5" },
      { title: "Vérifier que MT5 répond correctement" },
      { title: "Relancer TradingBook si l’erreur persiste" },
    ],
  },
  PYTHON_NOT_FOUND: {
    title: "Python introuvable",
    message:
      "Python n’est pas installé ou n’est pas accessible depuis TradingBook. Installez Python 3.8 ou plus récent, puis réessayez.",
    severity: "error",
    actions: [
      { title: "Installer Python 3.8 ou plus récent", command: "https://python.org/downloads" },
      { title: "Vérifier que Python est dans le PATH", command: "python --version" },
      { title: "Installer le package MetaTrader5", command: "pip install MetaTrader5" },
    ],
  },
  PYTHON_PACKAGE_MISSING: {
    title: "Package Python MetaTrader5 manquant",
    message:
      "Le package Python MetaTrader5 n’est pas installé. Installez-le localement, puis relancez la vérification.",
    severity: "error",
    actions: [
      { title: "Ouvrir PowerShell ou cmd" },
      { title: "Installer le package MetaTrader5", command: "pip install MetaTrader5" },
      { title: "Cliquer à nouveau sur Vérifier" },
    ],
  },
  BRIDGE_EXECUTION_FAILED: {
    title: "Bridge MT5 en échec",
    message:
      "Le bridge local MT5 n’a pas pu s’exécuter correctement. Vérifiez Python, MT5, puis réessayez.",
    severity: "error",
    actions: [
      { title: "Vérifier Python", command: "python --version" },
      { title: "Vérifier le package MetaTrader5", command: "pip show MetaTrader5" },
      { title: "Consulter les logs techniques locaux si l’erreur persiste" },
    ],
  },
  INVALID_DATE_RANGE: {
    title: "Période invalide",
    message:
      "La période demandée n’est pas valide. Choisissez une date de début et une date de fin cohérentes.",
    severity: "warning",
    actions: [
      { title: "Choisir une date de début valide" },
      { title: "Vérifier que la date de fin n’est pas avant la date de début" },
    ],
  },
  NO_MT5_DATA: {
    title: "Aucune donnée MT5",
    message:
      "MT5 n’a retourné aucune donnée pour cette période. Essayez une période plus large ou vérifiez le compte connecté.",
    severity: "info",
    actions: [
      { title: "Essayer une période plus large" },
      { title: "Vérifier le compte actif dans MT5" },
    ],
  },
  MT5_DATA_INVALID: {
    title: "Données MT5 invalides",
    message:
      "Certaines données MT5 reçues sont incomplètes ou invalides. Elles n’ont pas été importées automatiquement.",
    severity: "warning",
    actions: [
      { title: "Vérifier les données dans MT5" },
      { title: "Relancer la synchronisation" },
    ],
  },
  SYNC_TIMEOUT: {
    title: "Synchronisation trop longue",
    message:
      "MT5 n’a pas répondu à temps. Réessayez avec MT5 ouvert et connecté, ou choisissez une période plus courte.",
    severity: "error",
    actions: [
      { title: "Vérifier que MT5 répond" },
      { title: "Réessayer avec une période plus courte" },
    ],
  },
  FILE_PERMISSION_DENIED: {
    title: "Permission fichier refusée",
    message:
      "TradingBook n’a pas les permissions nécessaires pour accéder au bridge MT5 local. Vérifiez les droits du dossier de l’application.",
    severity: "error",
    actions: [
      { title: "Vérifier les droits du dossier TradingBook" },
      { title: "Relancer TradingBook avec les permissions habituelles" },
    ],
  },
  UNKNOWN_MT5_ERROR: {
    title: "Erreur MT5 inattendue",
    message:
      "Une erreur inattendue est survenue pendant l’accès à MT5. TradingBook reste utilisable, vous pouvez réessayer.",
    severity: "error",
    actions: [
      { title: "Vérifier que MT5 est ouvert et connecté" },
      { title: "Relancer la vérification" },
      { title: "Consulter les logs techniques locaux si l’erreur persiste" },
    ],
  },
};

const LEGACY_CODE_MAP: Record<string, MT5ErrorCode> = {
  MT5_LIB_MISSING: "PYTHON_PACKAGE_MISSING",
  MT5_NO_DATA: "NO_MT5_DATA",
  MT5_UNKNOWN_ERROR: "UNKNOWN_MT5_ERROR",
  INVALID_PERIOD: "INVALID_DATE_RANGE",
  PYTHON3_NOT_FOUND: "PYTHON_NOT_FOUND",
  SCRIPT_ERROR: "BRIDGE_EXECUTION_FAILED",
  PARSE_ERROR: "BRIDGE_EXECUTION_FAILED",
  TIMEOUT: "SYNC_TIMEOUT",
};

const KNOWN_ERROR_CODES = new Set<string>(MT5_ERROR_CODES);

export function isMT5ErrorCode(code: string | null | undefined): code is MT5ErrorCode {
  return typeof code === "string" && KNOWN_ERROR_CODES.has(code);
}

export function normalizeMT5ErrorCode(
  code?: string | null,
  message?: string | null,
): MT5ErrorCode {
  const rawCode = code?.trim().toUpperCase() ?? "";
  const rawMessage = message ?? "";
  const haystack = `${rawCode} ${rawMessage}`.toLowerCase();

  if (isMT5ErrorCode(rawCode)) return rawCode;
  if (LEGACY_CODE_MAP[rawCode]) return LEGACY_CODE_MAP[rawCode];

  if (
    haystack.includes("permission") ||
    haystack.includes("access denied") ||
    haystack.includes("eacces") ||
    haystack.includes("eperm")
  ) {
    return "FILE_PERMISSION_DENIED";
  }

  if (
    haystack.includes("no module named") ||
    haystack.includes("metatrader5 module") ||
    haystack.includes("pip install metatrader5") ||
    (haystack.includes("biblioth") && haystack.includes("metatrader5"))
  ) {
    return "PYTHON_PACKAGE_MISSING";
  }

  if (
    haystack.includes("python") &&
    (haystack.includes("not found") ||
      haystack.includes("cannot find") ||
      haystack.includes("introuvable") ||
      haystack.includes("os error 2"))
  ) {
    return "PYTHON_NOT_FOUND";
  }

  if (
    haystack.includes("date") &&
    (haystack.includes("invalid") ||
      haystack.includes("invalide") ||
      haystack.includes("from") ||
      haystack.includes("to"))
  ) {
    return "INVALID_DATE_RANGE";
  }

  if (
    haystack.includes("timeout") ||
    haystack.includes("timed out") ||
    haystack.includes("n'a pas répondu") ||
    haystack.includes("n’a pas répondu")
  ) {
    return "SYNC_TIMEOUT";
  }

  if (
    haystack.includes("no data") ||
    haystack.includes("aucune donnée") ||
    haystack.includes("aucun deal")
  ) {
    return "NO_MT5_DATA";
  }

  if (
    haystack.includes("not connected") ||
    haystack.includes("pas connecté") ||
    haystack.includes("non connecté") ||
    haystack.includes("not logged")
  ) {
    return "MT5_NOT_CONNECTED";
  }

  if (
    haystack.includes("terminal") &&
    (haystack.includes("not found") ||
      haystack.includes("introuvable") ||
      haystack.includes("not installed"))
  ) {
    return "MT5_NOT_INSTALLED";
  }

  if (
    haystack.includes("no ipc connection") ||
    haystack.includes("not running") ||
    haystack.includes("mt5 fermé") ||
    haystack.includes("terminal fermé")
  ) {
    return "MT5_NOT_RUNNING";
  }

  if (
    haystack.includes("initialize") ||
    haystack.includes("terminal") ||
    haystack.includes("ipc")
  ) {
    return "MT5_TERMINAL_UNREACHABLE";
  }

  if (haystack.includes("invalid") || haystack.includes("invalide")) {
    return "MT5_DATA_INVALID";
  }

  if (haystack.includes("bridge") || haystack.includes("json") || haystack.includes("stdout")) {
    return "BRIDGE_EXECUTION_FAILED";
  }

  return "UNKNOWN_MT5_ERROR";
}

export function buildMT5UserFacingError(input: MT5ErrorInput): MT5UserFacingError {
  const code = normalizeMT5ErrorCode(input.code, input.message);
  const definition = ERROR_DEFINITIONS[code];
  const technicalDetails = stringifyTechnicalDetails(
    input.technicalDetails ?? input.message,
  );

  return {
    code,
    title: definition.title,
    message: definition.message,
    severity: definition.severity,
    actions: definition.actions,
    technicalDetails: technicalDetails ?? undefined,
  };
}

export function buildMT5ResultError(input: MT5ErrorInput): {
  errorCode: MT5ErrorCode;
  message: string;
} {
  const error = buildMT5UserFacingError(input);
  logMT5TechnicalError(error, input);
  return {
    errorCode: error.code,
    message: error.message,
  };
}

export function getMT5ErrorResolutionSteps(
  code?: string | null,
): MT5UserAction[] {
  const normalizedCode = normalizeMT5ErrorCode(code);
  return ERROR_DEFINITIONS[normalizedCode].actions;
}

export function logMT5TechnicalError(
  error: MT5UserFacingError,
  input: MT5ErrorInput,
): void {
  const details = stringifyTechnicalDetails(input.technicalDetails ?? input.message);
  const prefix = input.context
    ? `MT5 ${input.context} failed`
    : "MT5 operation failed";
  const line =
    `${prefix}: code=${error.code}; userMessage=${error.message}` +
    (details ? `; technical=${details}` : "");

  if (error.severity === "info") {
    logger.info(line);
  } else if (error.severity === "warning") {
    logger.warn(line);
  } else {
    logger.error(line);
  }
}

function stringifyTechnicalDetails(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
