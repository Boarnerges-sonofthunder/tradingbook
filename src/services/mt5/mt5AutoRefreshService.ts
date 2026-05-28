// ============================================================
// MT5 Auto-Refresh Service — TradingBook
// ============================================================
// Phase 6 Étape 9 — Synchronisation automatique périodique.
//
// Ce module est un singleton. Il gère :
//   - le timer setInterval
//   - le verrou anti-concurrence (_isSyncing)
//   - la protection contre les exécutions simultanées
//
// API publique :
//   startAutoRefresh(intervalMs, onTick, onStatusChange?)
//   stopAutoRefresh()
//   runSyncWithLock(onSync, onStatusChange?)
//   isAutoRefreshActive()
//   isSyncInProgress()
//
// IMPORTANT : Ce service ne contient aucun état React.
//   → interagir via le hook useMT5AutoRefresh.
// ============================================================

import { createLogger } from "../logging";

const logger = createLogger("mt5-auto-refresh");

// ─── État singleton ────────────────────────────────────────

/** ID du timer setInterval actif, ou null si arrêté. */
let _timerId: ReturnType<typeof setInterval> | null = null;

/**
 * Verrou anti-concurrence.
 * true si une synchronisation (auto ou manuelle) est en cours.
 */
let _isSyncing = false;

/** Callback de notification de changement de statut (actif quand timer actif). */
let _globalOnStatusChange: ((isSyncing: boolean) => void) | null = null;

// ─── API publique ──────────────────────────────────────────

/**
 * Démarre le timer de refresh automatique.
 * Remplace tout timer précédent (stopAutoRefresh est appelé en premier).
 *
 * @param intervalMs     — intervalle en millisecondes entre les syncs
 * @param onTick         — callback asynchrone appelé à chaque tick
 * @param onStatusChange — appelé quand isSyncing change (true = début, false = fin)
 */
export function startAutoRefresh(
  intervalMs: number,
  onTick: () => Promise<void>,
  onStatusChange?: (isSyncing: boolean) => void,
): void {
  stopAutoRefresh();

  _globalOnStatusChange = onStatusChange ?? null;

  logger.info(`Auto-refresh MT5 démarré — intervalle : ${intervalMs / 1000}s`);

  _timerId = setInterval(() => {
    void _runTickSafely(onTick);
  }, intervalMs);
}

/**
 * Arrête le timer de refresh automatique.
 * N'interrompt pas une synchronisation déjà en cours.
 */
export function stopAutoRefresh(): void {
  if (_timerId !== null) {
    clearInterval(_timerId);
    _timerId = null;
    _globalOnStatusChange = null;
    logger.info("Auto-refresh MT5 arrêté");
  }
}

/** Retourne true si le timer de refresh automatique est actif. */
export function isAutoRefreshActive(): boolean {
  return _timerId !== null;
}

/** Retourne true si une synchronisation est actuellement en cours. */
export function isSyncInProgress(): boolean {
  return _isSyncing;
}

/**
 * Lance une synchronisation immédiate en utilisant le même verrou.
 * Si une sync est déjà en cours (auto ou manuelle), retourne false sans lancer.
 *
 * @param onSync         — callback asynchrone de synchronisation
 * @param onStatusChange — appelé quand isSyncing change (prioritaire sur le global)
 * @returns true si la sync a été lancée, false si déjà en cours
 */
export async function runSyncWithLock(
  onSync: () => Promise<void>,
  onStatusChange?: (isSyncing: boolean) => void,
): Promise<boolean> {
  if (_isSyncing) {
    logger.debug("runSyncWithLock : synchronisation déjà en cours, ignoré.");
    return false;
  }
  await _runSafe(onSync, onStatusChange ?? _globalOnStatusChange);
  return true;
}

// ─── Helpers internes ──────────────────────────────────────

/**
 * Exécute un tick de façon sécurisée.
 * Si une sync est déjà en cours, le tick est ignoré (sans erreur).
 */
async function _runTickSafely(onTick: () => Promise<void>): Promise<void> {
  if (_isSyncing) {
    logger.debug("Auto-refresh MT5 : sync déjà en cours, tick ignoré.");
    return;
  }
  await _runSafe(onTick, _globalOnStatusChange);
}

/**
 * Acquiert le verrou, exécute fn, libère le verrou.
 * Toute erreur non gérée est capturée (ne lève jamais d'exception).
 */
async function _runSafe(
  fn: () => Promise<void>,
  onStatusChange: ((isSyncing: boolean) => void) | null,
): Promise<void> {
  _isSyncing = true;
  onStatusChange?.(true);

  try {
    await fn();
  } catch (err) {
    logger.error(`Auto-refresh MT5 : erreur inattendue — ${String(err)}`);
  } finally {
    _isSyncing = false;
    onStatusChange?.(false);
  }
}
