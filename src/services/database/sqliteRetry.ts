// ============================================================
// SQLite retry helpers
// ============================================================
// SQLite peut retourner SQLITE_BUSY (code 5) lorsqu'un backup, une migration
// ou une autre ecriture garde temporairement un verrou sur la base locale.
// Ces helpers ne masquent pas les erreurs permanentes : ils attendent seulement
// sur les verrous transitoires, puis relancent l'erreur si le verrou persiste.
// ============================================================

import { createLogger } from "../logging";

interface DatabaseBusyRetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  operationName?: string;
}

const logger = createLogger("sqlite-retry");

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isDatabaseLockedError(err: unknown): boolean {
  const message = String(err).toLowerCase();
  return (
    message.includes("database is locked") ||
    message.includes("sqlite_busy") ||
    message.includes("code: 5")
  );
}

export async function withDatabaseBusyRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseBusyRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const initialDelayMs = options.initialDelayMs ?? 150;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (!isDatabaseLockedError(err) || attempt === attempts) {
        throw err;
      }

      const delayMs = initialDelayMs * 2 ** (attempt - 1);
      logger.warn(
        `[SQLite] Verrou temporaire pendant ${options.operationName ?? "operation"}, retry ${attempt}/${attempts}`,
      );
      await wait(delayMs);
    }
  }

  throw lastError;
}
