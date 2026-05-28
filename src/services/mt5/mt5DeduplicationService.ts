// ============================================================
// MT5 Deduplication Service — TradingBook
// ============================================================
// Phase 6 Étape 5 — Déduplication des candidats MT5 avant écriture SQLite.
//
// RESPONSABILITÉ :
//   Prend une liste de trades candidats (CreateTradeInput[]) issus du
//   mapping MT5 et les trie en trois catégories :
//
//   toInsert  — Nouveau trade inconnu de SQLite → doit être inséré.
//   toUpdate  — Trade existant dont les données ont changé → mise à jour.
//   skipped   — Trade ignoré (doublon exact, ou cas où on ne modifie rien).
//
// CLEF DE DÉDUPLICATION :
//   external_id = "mt5_pos_{positionId}"
//
//   Avantage vs CSV : MT5 garantit des positionId uniques et stables.
//   Pas de risque de collision cross-broker grâce au préfixe "mt5_pos_".
//
// RÈGLES DE DÉCISION :
//
//   Existant \ Candidat │ Candidat "open"        │ Candidat "closed"
//   ────────────────────┼────────────────────────┼──────────────────────────────
//   Rien dans SQLite    │ toInsert               │ toInsert
//   "open" dans SQLite  │ toUpdate (refresh P&L) │ toUpdate (fermer le trade)
//   "closed" dans SQLite│ skipped (ne pas rouvrir│ skipped (déjà importé)
//   "cancelled"         │ skipped                │ skipped
//
// CHAMPS MIS À JOUR pour "open" → "open" (refresh P&L position ouverte) :
//   - swap, grossPnl, netPnl (floating P&L = change en permanence)
//   - stopLoss, takeProfit (l'utilisateur peut les modifier dans MT5)
//   PAS modifiés : entryPrice, volume, side, openedAt, symbol (invariants)
//   PAS modifiés : notes, strategyId, tags, emotions, mistakes (données utilisateur)
//
// CHAMPS MIS À JOUR pour "open" → "closed" (fermeture d'une position) :
//   - status = "closed"
//   - exitPrice, closedAt
//   - grossPnl, netPnl, commission, swap, fees (résultats définitifs)
//   PAS modifiés : notes, strategyId, tags, emotions, mistakes
//
// RÈGLE DE SÉCURITÉ :
//   Ce service est en lecture seule sur SQLite (uniquement des SELECT
//   via findTradesByExternalIds). L'écriture est faite par mt5SyncService.
// ============================================================

import { createLogger } from "../logging";
import { findTradesByExternalIds } from "../../repositories/tradesRepository";
import type { CreateTradeInput, UpdateTradeInput, Trade } from "../../types";

const logger = createLogger("mt5-deduplication");

// ─── Types publics ─────────────────────────────────────────

/** Résultat de la déduplication pour un trade à insérer. */
export interface MT5TradeToInsert {
  data: CreateTradeInput;
}

/** Résultat de la déduplication pour un trade existant à mettre à jour. */
export interface MT5TradeToUpdate {
  id: number;
  externalId: string;
  data: UpdateTradeInput;
  reason: "close_trade" | "refresh_pnl";
}

/** Résultat de la déduplication pour un trade ignoré (doublon exact). */
export interface MT5TradeSkipped {
  externalId: string;
  reason:
    | "already_closed"         // trade déjà fermé et candidat fermé
    | "candidate_opens_closed" // MT5 dit "ouvert" mais SQLite dit "fermé" → ne pas rouvrir
    | "no_external_id";        // externalId manquant (cas anormal)
}

/** Résultat global de la déduplication. */
export interface MT5DeduplicationResult {
  toInsert: MT5TradeToInsert[];
  toUpdate: MT5TradeToUpdate[];
  skipped: MT5TradeSkipped[];
}

// ─── Fonction principale ───────────────────────────────────

/**
 * Trie les candidats MT5 en trois catégories (insérer / mettre à jour / ignorer).
 *
 * Les candidats sans externalId sont ignorés (ne devrait pas arriver
 * car mt5MappingService assigne toujours un externalId).
 *
 * @param candidates — trades candidats produits par mt5MappingService
 * @returns         — {toInsert, toUpdate, skipped}
 */
export async function deduplicateMT5Candidates(
  candidates: CreateTradeInput[],
): Promise<MT5DeduplicationResult> {
  const result: MT5DeduplicationResult = {
    toInsert: [],
    toUpdate: [],
    skipped: [],
  };

  if (candidates.length === 0) {
    logger.debug("deduplicateMT5Candidates : aucun candidat à traiter");
    return result;
  }

  // ── Extraire les externalIds des candidats ────────────────────
  const candidatesWithId = candidates.filter((c) => !!c.externalId);
  const candidatesWithoutId = candidates.filter((c) => !c.externalId);

  // Signaler les candidats sans externalId (anormal)
  for (const c of candidatesWithoutId) {
    logger.warn(
      `deduplicateMT5Candidates : candidat sans externalId ignoré (symbol=${c.symbol})`,
    );
    result.skipped.push({
      externalId: "(none)",
      reason: "no_external_id",
    });
  }

  const externalIds = candidatesWithId.map((c) => c.externalId!);

  // ── Charger les trades existants en une seule requête ─────────
  const existingTrades = await findTradesByExternalIds(externalIds);
  const existingByExternalId = new Map<string, Trade>(
    existingTrades.map((t) => [t.externalId!, t]),
  );

  logger.debug(
    `deduplicateMT5Candidates : ${candidatesWithId.length} candidats, ${existingTrades.length} déjà en base`,
  );

  // ── Trier chaque candidat ─────────────────────────────────────
  for (const candidate of candidatesWithId) {
    const externalId = candidate.externalId!;
    const existing = existingByExternalId.get(externalId);

    if (!existing) {
      // ── Cas 1 : trade inconnu → insérer ───────────────────────
      result.toInsert.push({ data: candidate });
      continue;
    }

    // ── Cas 2 : trade existant → analyser le statut ───────────
    const candidateIsClosed = candidate.status === "closed";
    const existingIsClosed = existing.status === "closed" || existing.status === "cancelled";

    if (existingIsClosed && candidateIsClosed) {
      // Trade déjà fermé dans SQLite et MT5 confirme fermé → doublon
      result.skipped.push({ externalId, reason: "already_closed" });
      continue;
    }

    if (existingIsClosed && !candidateIsClosed) {
      // SQLite dit "fermé" mais MT5 dit "ouvert" → incohérence
      // Ne pas rouvrir un trade fermé (sécurité)
      logger.warn(
        `deduplicateMT5Candidates : ${externalId} — MT5 dit ouvert mais SQLite dit fermé. Ignoré.`,
      );
      result.skipped.push({ externalId, reason: "candidate_opens_closed" });
      continue;
    }

    if (!existingIsClosed && candidateIsClosed) {
      // ── Cas 3 : position fermée entre deux syncs → fermer le trade ─
      result.toUpdate.push({
        id: existing.id,
        externalId,
        reason: "close_trade",
        data: buildCloseTradeUpdate(candidate),
      });
      continue;
    }

    // ── Cas 4 : position encore ouverte → refresh du P&L flottant ─
    // (existing.status === "open" && !candidateIsClosed)
    result.toUpdate.push({
      id: existing.id,
      externalId,
      reason: "refresh_pnl",
      data: buildRefreshPnlUpdate(candidate),
    });
  }

  logger.info(
    `deduplicateMT5Candidates : ${result.toInsert.length} à insérer, ` +
      `${result.toUpdate.length} à mettre à jour, ${result.skipped.length} ignorés`,
  );

  return result;
}

// ─── Constructeurs d'UpdateTradeInput ──────────────────────

/**
 * Construit l'objet de mise à jour pour fermer un trade ouvert.
 *
 * Champs mis à jour :
 *   status, exitPrice, closedAt, grossPnl, netPnl, commission, swap, fees
 *
 * Champs JAMAIS modifiés (invariants) :
 *   symbol, side, openedAt, entryPrice, volume, platform, source
 *   notes, strategyId, tags, emotions, mistakes (données utilisateur)
 */
function buildCloseTradeUpdate(candidate: CreateTradeInput): UpdateTradeInput {
  return {
    status: "closed",
    exitPrice: candidate.exitPrice ?? null,
    closedAt: candidate.closedAt ?? null,
    grossPnl: candidate.grossPnl ?? null,
    netPnl: candidate.netPnl ?? null,
    commission: candidate.commission,
    swap: candidate.swap,
    fees: candidate.fees,
    // SL/TP peuvent aussi avoir changé
    stopLoss: candidate.stopLoss ?? null,
    takeProfit: candidate.takeProfit ?? null,
  };
}

/**
 * Construit l'objet de mise à jour pour rafraîchir le P&L flottant
 * d'une position encore ouverte.
 *
 * Champs mis à jour : swap, grossPnl, netPnl, stopLoss, takeProfit
 * SEULEMENT — car ce sont les seuls susceptibles de varier.
 *
 * Champs JAMAIS modifiés (invariants) :
 *   status, entryPrice, volume, openedAt, side, symbol
 *   notes, strategyId, tags, emotions, mistakes
 */
function buildRefreshPnlUpdate(candidate: CreateTradeInput): UpdateTradeInput {
  return {
    swap: candidate.swap,
    grossPnl: candidate.grossPnl ?? null,
    netPnl: candidate.netPnl ?? null,
    stopLoss: candidate.stopLoss ?? null,
    takeProfit: candidate.takeProfit ?? null,
  };
}
