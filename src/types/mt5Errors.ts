// ============================================================
// Types - MT5 user-facing errors
// ============================================================
// These codes describe MT5 sync failures in a stable way for the UI.
// Technical details stay in the local logger, not in user-facing text.
// ============================================================

export const MT5_ERROR_CODES = [
  "MT5_NOT_INSTALLED",
  "MT5_NOT_RUNNING",
  "MT5_NOT_CONNECTED",
  "MT5_TERMINAL_UNREACHABLE",
  "PYTHON_NOT_FOUND",
  "PYTHON_PACKAGE_MISSING",
  "BRIDGE_EXECUTION_FAILED",
  "INVALID_DATE_RANGE",
  "NO_MT5_DATA",
  "MT5_DATA_INVALID",
  "SYNC_TIMEOUT",
  "FILE_PERMISSION_DENIED",
  "UNKNOWN_MT5_ERROR",
] as const;

export type MT5ErrorCode = (typeof MT5_ERROR_CODES)[number];

export type MT5ErrorSeverity = "info" | "warning" | "error";

export interface MT5UserAction {
  title: string;
  command?: string;
}

export interface MT5UserFacingError {
  code: MT5ErrorCode;
  title: string;
  message: string;
  severity: MT5ErrorSeverity;
  actions: MT5UserAction[];
  technicalDetails?: string;
}

export interface MT5ErrorInput {
  code?: string | null;
  message?: string | null;
  technicalDetails?: unknown;
  context?: string;
}
