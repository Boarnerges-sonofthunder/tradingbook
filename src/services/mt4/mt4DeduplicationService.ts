// ============================================================
// MT4 Deduplication Service — TradingBook
// ============================================================
// Phase 6 Étape 2.1 — Architecture préparée (NON IMPLÉMENTÉ)
//
// RESPONSABILITÉS (futures) :
//   - Détecter les trades MT4 déjà présents dans SQLite
//   - Éviter les doublons lors des imports répétés
//   - Identifier un doublon MT4 via le ticket (externalId)
//
// CLÉ DE DÉDUPLICATION MT4 :
//   Un trade MT4 est unique par : ticket + accountId + broker
//
//   Colonne SQLite utilisée : external_id
//   Format de l'externalId : "mt4-<account>-<ticket>"
//   Exemple               : "mt4-12345678-98765432"
//
// DIFFÉRENCE AVEC LA DÉDUPLICATION CSV/MT5 :
//   CSV/MT5 — peut comparer openedAt + symbol + side + volume
//             (matching flou si externalId absent)
//   MT4    — le ticket est TOUJOURS disponible et unique dans MT4
//             → déduplication stricte par externalId uniquement
//
// COMPORTEMENT RECOMMANDÉ :
//   - Si externalId existe déjà → SKIP (ne pas réimporter)
//   - Si externalId absent      → INSERT
//   - Ne jamais mettre à jour un trade existant automatiquement
//     (l'utilisateur peut corriger manuellement)
//
// ÉTAT : 🔲 NON IMPLÉMENTÉ — stubs architecturaux uniquement
// ============================================================

import { createLogger } from "../logging";
import type { CreateTradeInput } from "../../types/trade";

const logger = createLogger("mt4-dedup");

// ─── Erreur de non-implémentation ──────────────────────────

class MT4NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `MT4DeduplicationService.${method}() — non implémenté (Phase 6 Étape future).`,
    );
    this.name = "MT4NotImplementedError";
  }
}

// ─── Types locaux ──────────────────────────────────────────

/**
 * Résultat de la déduplication d'un lot de trades MT4.
 */
export interface MT4DeduplicationResult {
  /** Trades nouveaux à insérer dans SQLite. */
  toInsert: CreateTradeInput[];

  /** Tickets des trades ignorés car déjà présents dans SQLite. */
  duplicateTickets: number[];

  /** Nombre de trades nouveaux. */
  newCount: number;

  /** Nombre de trades ignorés (doublons). */
  duplicateCount: number;
}

// ─── Fonctions publiques (stubs) ───────────────────────────

/**
 * Filtre un tableau de CreateTradeInput en retirant les doublons.
 *
 * Compare les externalId ("mt4-<account>-<ticket>") contre la table `trades`
 * SQLite pour identifier les doublons.
 *
 * @param trades - Trades mappés par mt4MappingService
 * @returns Résultat avec trades nouveaux et tickets dupliqués
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 *   - Extraire les externalIds du tableau `trades`
 *   - Requête SQLite : SELECT external_id FROM trades WHERE external_id IN (...)
 *     AND platform = 'mt4'
 *   - Séparer toInsert (absents) et duplicates (présents)
 */
export async function deduplicateMT4Trades(
  trades: CreateTradeInput[],
): Promise<MT4DeduplicationResult> {
  logger.debug(
    `deduplicateMT4Trades() appelé — ${trades.length} trades à vérifier`,
  );
  throw new MT4NotImplementedError("deduplicateMT4Trades");
}

/**
 * Construit l'externalId d'un trade MT4.
 *
 * Format : "mt4-<accountId>-<ticket>"
 *
 * Cette fonction est utile pour générer l'externalId dans mt4MappingService.
 * Ne throw jamais — opération synchrone pure.
 *
 * @param accountId - Numéro de compte MT4 (ex: 12345678)
 * @param ticket    - Numéro de ticket MT4 (ex: 98765432)
 * @returns ExternalId formaté (ex: "mt4-12345678-98765432")
 *
 * @todo Activer en Phase 6 Étape MT4 (supprimer le throw).
 */
export function buildMT4ExternalId(
  accountId: number,
  ticket: number,
): string {
  void accountId;
  void ticket;
  throw new MT4NotImplementedError("buildMT4ExternalId");
}
