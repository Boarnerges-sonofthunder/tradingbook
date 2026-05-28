// ============================================================
// Trade Deduplication Service — TradingBook
// ============================================================
// Phase 5 Étape 9 — Détection des doublons avant import CSV.
//
// Responsabilités :
//   - Comparer les lignes CSV importables avec les trades existants
//   - Détecter deux niveaux de doublons :
//       1. Doublon EXACT   → trade identique, sera ignoré
//       2. Doublon PROBABLE → trade ressemblant, à vérifier
//   - Retourner un rapport de déduplication complet
//
// RÈGLES DE DÉDUPLICATION :
//
//   Doublon exact (priorité 1) :
//     A. Par external_id : même external_id ET account_id compatible
//     B. Par empreinte   : même symbol, side, opened_at (±60s),
//                          entry_price et volume (±0.01%)
//        + net_pnl si les deux sont présents (±0.01 absolu)
//
//   Doublon probable (si pas d'exact) :
//     Critères MINIMAUX requis :
//       - Même symbol
//       - Volume similaire (±5%)
//       - opened_at proche (±5 minutes)
//     Score (0–1.0) :
//       +0.4 proximité temporelle (linéaire 0s→0.4, 300s→0)
//       +0.3 proximité volume    (linéaire 0%→0.3, 5%→0)
//       +0.2 même side
//       +0.1 P&L similaire (±1%)
//     Seuil minimum pour signaler : score ≥ 0.4
//
// ARCHITECTURE :
//   - Ce service appelle le repository (I/O SQLite)
//   - La logique de matching est purement fonctionnelle (pas d'I/O)
//   - React ne voit que le rapport final — jamais le repository
//   - Ne supprime et ne modifie AUCUN trade existant
// ============================================================

import { findTradesForDeduplication } from "../../repositories/tradesRepository";
import type { CsvValidatedRow } from "../../types/csvImport";
import type {
  CsvDeduplicationMatch,
  CsvDeduplicatedRow,
  CsvDeduplicationReport,
} from "../../types/csvImport";
import type { Trade } from "../../types";
import { createLogger } from "../logging";

const logger = createLogger("deduplication");

// ─── Contexte de session ───────────────────────────────────

/**
 * Informations de contexte de la session d'import en cours.
 * Transmises par ImportsPage depuis la détection broker.
 */
export interface DeduplicationContext {
  /** Broker détecté ou sélectionné (ex: "MetaTrader 5", "mt5"). */
  broker?: string | null;
  /** Numéro de compte trading — utilisé pour affiner la correspondance. */
  accountId?: string | null;
  /** Référence compte normalisée si l'utilisateur sélectionne un compte local. */
  tradingAccountId?: number | null;
  /** Plateforme source : "csv" par défaut. */
  platform?: "csv" | "mt5" | "manual";
}

// ─── Helpers de comparaison numérique ──────────────────────

/**
 * Compare deux nombres avec une tolérance RELATIVE.
 * Exemple : approxEqualRel(1.0001, 1.0000, 0.0001) → true (0.01% de tolérance)
 */
function approxEqualRel(a: number, b: number, relTol: number): boolean {
  const maxAbs = Math.max(Math.abs(a), Math.abs(b));
  if (maxAbs === 0) return true;
  return Math.abs(a - b) / maxAbs <= relTol;
}

/**
 * Compare deux nombres avec une tolérance ABSOLUE.
 * Exemple : approxEqualAbs(-45.30, -45.31, 0.02) → true
 */
function approxEqualAbs(a: number, b: number, absTol: number): boolean {
  return Math.abs(a - b) <= absTol;
}

/**
 * Calcule la différence en secondes entre une date ISO string et un objet Date.
 * Retourne Infinity si la date ISO est invalide.
 */
function secondsDiff(isoString: string, date: Date): number {
  const ts = new Date(isoString).getTime();
  if (isNaN(ts)) return Infinity;
  return Math.abs(ts - date.getTime()) / 1000;
}

// ─── Détection : doublon exact par external_id ─────────────

/**
 * Cherche un doublon EXACT par external_id.
 *
 * Critères :
 *   1. La ligne CSV a un externalId non nul
 *   2. Un trade existant a le même external_id
 *   3. Si les deux ont un account_id, ils doivent être identiques
 *      (compatibilité multi-compte : un ticket peut exister sur deux comptes)
 *
 * Cette méthode est prioritaire sur la correspondance par empreinte.
 */
function matchExactByExternalId(
  row: CsvValidatedRow,
  existingTrades: Trade[],
  context: DeduplicationContext,
): Trade | null {
  const extId = row.parsed.externalId;
  if (!extId) return null;

  for (const trade of existingTrades) {
    if (trade.externalId !== extId) continue;

    // Priorité au compte normalisé si connu côté import
    if (context.tradingAccountId && trade.tradingAccountId) {
      if (context.tradingAccountId !== trade.tradingAccountId) continue;
    }

    // Si les deux ont un account_id et qu'ils diffèrent → pas une correspondance
    const rowAccountId = context.accountId ?? null;
    if (rowAccountId && trade.accountId && rowAccountId !== trade.accountId) {
      continue;
    }

    return trade;
  }

  return null;
}

// ─── Détection : doublon exact par empreinte ───────────────

/**
 * Cherche un doublon EXACT par empreinte numérique.
 *
 * Utilisé quand external_id est absent ou ne correspond à rien.
 *
 * Critères (TOUS obligatoires) :
 *   - symbol identique (insensible à la casse)
 *   - side identique (buy/sell)
 *   - opened_at identique à ±60 secondes
 *   - entry_price identique à ±0.01% (tolérance flottante)
 *   - volume identique à ±0.01%
 *   - net_pnl identique à ±0.01 absolu (si les deux sont présents)
 */
function matchExactByFingerprint(
  row: CsvValidatedRow,
  existingTrades: Trade[],
): Trade | null {
  const { symbol, side, openedAt, entryPrice, volume, netPnl } = row.parsed;

  // Tous les champs obligatoires doivent être présents
  if (!symbol || !side || !openedAt || entryPrice === null || volume === null) {
    return null;
  }

  const symbolNorm = symbol.toUpperCase();

  for (const trade of existingTrades) {
    // Symbol (insensible à la casse)
    if (trade.symbol.toUpperCase() !== symbolNorm) continue;

    // Sens du trade
    if (trade.side !== side) continue;

    // Date d'ouverture : tolérance ±60 secondes (normalisation des formats)
    if (secondsDiff(trade.openedAt, openedAt) > 60) continue;

    // Prix d'entrée : tolérance relative ±0.01%
    if (!approxEqualRel(trade.entryPrice, entryPrice, 0.0001)) continue;

    // Volume : tolérance relative ±0.01%
    if (!approxEqualRel(trade.volume, volume, 0.0001)) continue;

    // P&L net : tolérance absolue ±0.01 (arrondi brokers)
    // Vérification uniquement si les deux sont présents
    if (netPnl !== null && trade.netPnl !== null) {
      if (!approxEqualAbs(trade.netPnl, netPnl, 0.01)) continue;
    }

    return trade;
  }

  return null;
}

// ─── Détection : doublon probable ─────────────────────────

interface ProbableMatchResult {
  trade: Trade;
  score: number;
  reason: string;
}

/**
 * Cherche le meilleur doublon PROBABLE parmi les trades existants.
 *
 * Critères MINIMAUX (tous requis pour être candidat) :
 *   - Même symbol
 *   - Volume similaire (±5%)
 *   - opened_at proche (±5 minutes / 300 secondes)
 *
 * Score calculé sur 1.0 :
 *   +0.4 proximité temporelle (linéaire : 0s → +0.4 · 300s → +0)
 *   +0.3 proximité de volume  (linéaire : 0% → +0.3 · 5%  → +0)
 *   +0.2 bonus si même side
 *   +0.1 bonus si net_pnl similaire (±1%)
 *
 * Seuil minimum pour être signalé : score ≥ 0.4
 *
 * Retourne le meilleur candidat au-dessus du seuil, ou null.
 */
function matchProbable(
  row: CsvValidatedRow,
  existingTrades: Trade[],
): ProbableMatchResult | null {
  const { symbol, side, openedAt, volume, netPnl } = row.parsed;

  // Champs minimaux nécessaires pour calculer la similarité
  if (!symbol || volume === null || !openedAt) return null;

  const symbolNorm = symbol.toUpperCase();
  let best: ProbableMatchResult | null = null;

  for (const trade of existingTrades) {
    // Symbol — condition non négociable
    if (trade.symbol.toUpperCase() !== symbolNorm) continue;

    // Volume : différence relative ±5%
    if (!approxEqualRel(trade.volume, volume, 0.05)) continue;

    // Date d'ouverture : ±5 minutes requis
    const diffSec = secondsDiff(trade.openedAt, openedAt);
    if (diffSec > 300) continue;

    // ── Calcul du score ──────────────────────────────────

    let score = 0;
    const reasons: string[] = [];

    // Proximité temporelle : 0–0.4 (linéaire 0–300s)
    const timeScore = 0.4 * (1 - diffSec / 300);
    score += timeScore;
    reasons.push(
      diffSec < 60
        ? `ouverture ±${Math.round(diffSec)}s`
        : `ouverture ±${Math.round(diffSec / 60)}min`,
    );

    // Proximité de volume : 0–0.3 (linéaire 0–5%)
    const volDiffRel =
      Math.abs(trade.volume - volume) /
      Math.max(trade.volume, volume, 0.0001);
    score += Math.max(0, 0.3 * (1 - volDiffRel / 0.05));
    reasons.push("volume similaire");

    // Bonus : même side (+0.2)
    if (side && trade.side === side) {
      score += 0.2;
      reasons.push("même sens");
    }

    // Bonus : P&L net similaire (+0.1)
    if (netPnl !== null && trade.netPnl !== null) {
      const maxPnl = Math.max(Math.abs(trade.netPnl), Math.abs(netPnl), 0.01);
      if (Math.abs(trade.netPnl - netPnl) / maxPnl <= 0.01) {
        score += 0.1;
        reasons.push("P&L similaire");
      }
    }

    // Seuil minimum + meilleure correspondance
    if (score >= 0.4 && (!best || score > best.score)) {
      best = {
        trade,
        score,
        reason: reasons.join(", "),
      };
    }
  }

  return best;
}

// ─── Formatage résumé trade ────────────────────────────────

/**
 * Génère un résumé lisible d'un trade existant pour l'affichage dans le panel.
 * Format : "#42 EURUSD buy 0.1lot · 2024-01-15 [±45.30]"
 */
function buildTradeSummary(trade: Trade): string {
  const date = trade.openedAt.slice(0, 10);
  const pnlStr =
    trade.netPnl !== null
      ? ` · ${trade.netPnl >= 0 ? "+" : ""}${trade.netPnl.toFixed(2)}`
      : "";
  return `#${trade.id} ${trade.symbol} ${trade.side} ${trade.volume}lot · ${date}${pnlStr}`;
}

// ─── Point d'entrée public ────────────────────────────────

/**
 * Analyse les doublons entre les lignes CSV et les trades existants en SQLite.
 *
 * Algorithme en 3 étapes :
 *   1. Extraire les symboles et external_ids uniques des lignes importables
 *   2. Charger en une seule requête tous les trades pertinents
 *   3. Pour chaque ligne : exact par external_id → exact par empreinte → probable
 *
 * Les lignes INVALIDES sont toujours marquées "new" (elles ne seront pas
 * importées, il est donc inutile de vérifier leurs doublons).
 *
 * En cas d'erreur SQLite, retourne un rapport "tout nouveau" (fail-open)
 * plutôt que de bloquer l'utilisateur.
 *
 * @param rows    — lignes validées par csvValidationService
 * @param context — contexte de la session (broker, accountId)
 */
export async function checkDuplicates(
  rows: CsvValidatedRow[],
  context: DeduplicationContext = {},
): Promise<CsvDeduplicationReport> {
  // Filtrer les lignes importables pour l'analyse
  const importableRows = rows.filter((r) => r.status !== "invalid");

  // Cas trivial : aucune ligne importable
  if (importableRows.length === 0) {
    return {
      rows: rows.map((r) => ({ index: r.index, status: "new" as const, match: null })),
      newCount: rows.length,
      exactDuplicateCount: 0,
      probableDuplicateCount: 0,
      hasDuplicates: false,
    };
  }

  // ── Extraire les clés pour la requête batch ──────────────

  const symbols = [
    ...new Set(
      importableRows
        .map((r) => r.parsed.symbol)
        .filter((s): s is string => s !== null),
    ),
  ];

  const externalIds = [
    ...new Set(
      importableRows
        .map((r) => r.parsed.externalId)
        .filter((id): id is string => id !== null),
    ),
  ];

  // ── Requête SQLite (une seule pour tout le fichier) ──────

  let existingTrades: Trade[] = [];
  try {
    existingTrades = await findTradesForDeduplication(symbols, externalIds);
    logger.debug(
      `Déduplication : ${existingTrades.length} trades existants chargés` +
        ` pour ${symbols.length} symboles, ${externalIds.length} external_ids`,
    );
  } catch (err) {
    // Fail-open : erreur SQLite non bloquante → tout est "nouveau"
    logger.warn(
      `Impossible de charger les trades pour déduplication : ${String(err)}`,
    );
    return {
      rows: rows.map((r) => ({ index: r.index, status: "new" as const, match: null })),
      newCount: rows.length,
      exactDuplicateCount: 0,
      probableDuplicateCount: 0,
      hasDuplicates: false,
    };
  }

  // Optimisation : si aucun trade existant, tout est nouveau
  if (existingTrades.length === 0) {
    logger.debug("Aucun trade existant — déduplication inutile");
    return {
      rows: rows.map((r) => ({ index: r.index, status: "new" as const, match: null })),
      newCount: rows.length,
      exactDuplicateCount: 0,
      probableDuplicateCount: 0,
      hasDuplicates: false,
    };
  }

  // ── Matching ligne par ligne ─────────────────────────────

  let exactDuplicateCount = 0;
  let probableDuplicateCount = 0;

  const dedupRows: CsvDeduplicatedRow[] = rows.map((row) => {
    // Les lignes invalides sont exclues → statut "new" (elles ne seront pas importées)
    if (row.status === "invalid") {
      return { index: row.index, status: "new" as const, match: null };
    }

    // ── Priorité 1 : doublon exact par external_id ───────
    const exactByExtId = matchExactByExternalId(row, existingTrades, context);
    if (exactByExtId) {
      exactDuplicateCount++;
      const matchInfo: CsvDeduplicationMatch = {
        tradeId: exactByExtId.id,
        tradeSummary: buildTradeSummary(exactByExtId),
        matchedFields: ["external_id", "account_id"],
        score: 1.0,
        reason: `Identifiant externe identique (${row.parsed.externalId ?? ""})`,
      };
      return { index: row.index, status: "exact_duplicate" as const, match: matchInfo };
    }

    // ── Priorité 2 : doublon exact par empreinte ─────────
    const exactByFp = matchExactByFingerprint(row, existingTrades);
    if (exactByFp) {
      exactDuplicateCount++;
      const matchInfo: CsvDeduplicationMatch = {
        tradeId: exactByFp.id,
        tradeSummary: buildTradeSummary(exactByFp),
        matchedFields: ["symbol", "side", "opened_at", "entry_price", "volume"],
        score: 1.0,
        reason: "Empreinte identique (symbol, sens, date, prix, volume)",
      };
      return { index: row.index, status: "exact_duplicate" as const, match: matchInfo };
    }

    // ── Priorité 3 : doublon probable ────────────────────
    const probable = matchProbable(row, existingTrades);
    if (probable) {
      probableDuplicateCount++;
      const matchInfo: CsvDeduplicationMatch = {
        tradeId: probable.trade.id,
        tradeSummary: buildTradeSummary(probable.trade),
        matchedFields: ["symbol", "volume", "opened_at"],
        score: probable.score,
        reason: probable.reason,
      };
      return {
        index: row.index,
        status: "probable_duplicate" as const,
        match: matchInfo,
      };
    }

    // Aucune correspondance → nouveau trade
    return { index: row.index, status: "new" as const, match: null };
  });

  const newCount = dedupRows.filter((r) => r.status === "new").length;

  logger.info(
    `Déduplication terminée : ${newCount} nouveaux, ` +
      `${exactDuplicateCount} exacts ignorés, ` +
      `${probableDuplicateCount} probables à vérifier`,
  );

  return {
    rows: dedupRows,
    newCount,
    exactDuplicateCount,
    probableDuplicateCount,
    hasDuplicates: exactDuplicateCount > 0 || probableDuplicateCount > 0,
  };
}
