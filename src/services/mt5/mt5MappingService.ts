// ============================================================
// MT5 Mapping Service — TradingBook
// ============================================================
// Phase 6 Étape 5 — Transformation des données MT5 brutes en trades TradingBook.
//
// RESPONSABILITÉS :
//   - Regrouper les deals MT5 par positionId (une position = un trade)
//   - Mapper chaque groupe de deals vers un CreateTradeInput
//   - Mapper chaque position ouverte MT5 vers un CreateTradeInput
//   - Calculer grossPnl et netPnl à partir des deals
//   - Remplir les champs platform="mt5", source="mt5"
//   - Ignorer les deals non-trade (balance, dépôts, etc.)
//
// MAPPING DEALS → TRADE FERMÉ :
//   Un trade fermé est reconstruit à partir de N deals partageant le même positionId.
//
//   MT5 Deal field   │ Trade field       │ Notes
//   ─────────────────┼───────────────────┼────────────────────────────────────────
//   positionId       │ externalId        │ préfixé "mt5_pos_" (ex: "mt5_pos_12345")
//   type ("buy"/"sell")│ side            │ depuis le deal "in"
//   time (deal "in") │ openedAt          │ depuis le deal d'ouverture
//   price (deal "in")│ entryPrice        │ depuis le deal d'ouverture
//   volume (deal "in")│ volume           │ depuis le deal d'ouverture
//   sl (deal "in")   │ stopLoss          │ 0 → null (convention MT5)
//   tp (deal "in")   │ takeProfit        │ 0 → null
//   time (deal "out")│ closedAt          │ depuis le deal de fermeture
//   price (deal "out")│ exitPrice        │ depuis le deal de fermeture
//   Σ(deal.profit)   │ grossPnl          │ somme de tous les profits trading
//   Σ(deal.commission│ commission        │ somme de toutes les commissions
//   Σ(deal.swap)     │ swap              │ somme de tous les swaps
//   Σ(deal.fee)      │ fees              │ somme de tous les frais
//   grossPnl+comm+..│ netPnl            │ P&L net toutes charges incluses
//   "mt5"            │ platform, source  │ constant
//
// MAPPING POSITION OUVERTE → TRADE OUVERT :
//   Une position ouverte (MT5RawPosition) → status = "open".
//
//   MT5 Position field │ Trade field    │ Notes
//   ──────────────────┼────────────────┼──────────────────────────────────────
//   positionId         │ externalId    │ "mt5_pos_{positionId}"
//   type               │ side          │ "buy" ou "sell"
//   openTime           │ openedAt      │ ISO 8601
//   openPrice          │ entryPrice    │
//   volume             │ volume        │
//   stopLoss           │ stopLoss      │ 0 → null
//   takeProfit         │ takeProfit    │ 0 → null
//   profit             │ grossPnl      │ P&L non réalisé MT5 (floating)
//   swap               │ swap          │ swap cumulé
//   commission         │ commission    │ commission d'ouverture
//   profit+swap        │ netPnl        │ commission non incluse (déjà dans commission)
//   null               │ exitPrice     │ position encore ouverte
//   null               │ closedAt      │ position encore ouverte
//   "open"             │ status        │ constant
//
// DEALS IGNORÉS (filtres) :
//   - type = "balance"      → dépôt/retrait (pas un trade)
//   - type = "credit"        → crédit broker
//   - positionId = 0         → deal non rattaché à une position
//   - type non "buy"/"sell" sans deal "in" associé → pas de trade mappable
//
// GESTION DES DEALS "inout" (retournement de position) :
//   Un deal entry="inout" ferme l'ancienne position et ouvre la nouvelle.
//   Il est traité comme "out" pour la position courante (exitPrice + closedAt).
//   La nouvelle position a son propre groupe avec un nouveau positionId.
//
// RÈGLE DE SÉCURITÉ :
//   Ce service est STRICTEMENT EN LECTURE — il ne lit ni n'écrit la DB.
//   Seuls des objets CreateTradeInput sont produits. L'écriture est faite
//   par mt5SyncService.ts.
// ============================================================

import { createLogger } from "../logging";
import type { MT5RawDeal, MT5RawPosition } from "../../types/mt5";
import type { CreateTradeInput, TradeSide, TradeStatus } from "../../types";
import {
  computeRewardDistance,
  computeRiskDistance,
  computeRiskReward,
} from "../../utils/tradeCalculations";

const logger = createLogger("mt5-mapping");

// ─── Constantes ────────────────────────────────────────────

/**
 * Préfixe de l'externalId pour les positions MT5.
 * Garantit l'unicité globale dans la table `trades`
 * (un ticket MT5 pourrait théoriquement coïncider avec un ticket CSV).
 */
export const MT5_EXTERNAL_ID_PREFIX = "mt5_pos_";

/**
 * Types de deal qui représentent de vrais trades de marché.
 * Les autres types (balance, credit, etc.) sont ignorés.
 */
const TRADING_DEAL_TYPES = new Set(["buy", "sell"]);

/**
 * Types de deals à ignorer complètement — ces transactions ne
 * correspondent pas à des trades et n'ont pas de positionId utile.
 */
const IGNORED_DEAL_TYPES = new Set(["balance", "credit", "charge", "correction"]);

// ─── Helpers internes ──────────────────────────────────────

/** Convertit le positionId en externalId unique TradingBook. */
export function mt5ExternalId(positionId: number): string {
  return `${MT5_EXTERNAL_ID_PREFIX}${positionId}`;
}

/**
 * Détermine si un deal est une transaction de marché (buy ou sell).
 * Les autres types (balance, commission, swap, etc.) sont des frais ou mouvements.
 */
function isTradingDeal(deal: MT5RawDeal): boolean {
  return TRADING_DEAL_TYPES.has(deal.type);
}

/**
 * Détermine si un deal ouvre une position ("in" ou premier "inout").
 * entry = "in"    → ouverture standard
 * entry = "inout" → retournement (ferme l'ancienne, ouvre la nouvelle)
 *                   traité comme "in" pour la NOUVELLE position
 */
function isEntryDeal(deal: MT5RawDeal): boolean {
  return deal.entry === "in";
}

/**
 * Détermine si un deal ferme une position ("out" ou "inout").
 * entry = "out"   → fermeture standard
 * entry = "inout" → retournement (traité comme "out" pour l'ANCIENNE position)
 * entry = "out_by"→ fermeture par position opposée (hedging mode)
 */
function isExitDeal(deal: MT5RawDeal): boolean {
  return deal.entry === "out" || deal.entry === "inout" || deal.entry === "out_by";
}

// ─── Mapping deals → trades fermés ─────────────────────────

/**
 * Contexte de compte MT5 passé au service pour enrichir les trades créés.
 */
export interface MT5MappingContext {
  /** Numéro de compte MT5. */
  account?: number;
  /** Identifiant string du compte. */
  accountId?: string;
  /** Serveur broker (ex: "FusionMarkets-Live"). */
  server?: string;
  /** Nom du broker (ex: "Fusion Markets Pty Ltd"). */
  broker?: string;
  /** Devise du compte (ex: "CAD", "USD"). */
  currency?: string;
}

/**
 * Groupe de deals appartenant à la même position MT5.
 * Utilisé en interne pendant le mapping.
 */
interface DealGroup {
  positionId: number;
  allDeals: MT5RawDeal[];
  entryDeals: MT5RawDeal[];  // deals avec entry = "in"
  exitDeals: MT5RawDeal[];   // deals avec entry = "out" | "inout" | "out_by"
}

/**
 * Mappe un tableau de deals MT5 bruts vers des CreateTradeInput[].
 *
 * ALGORITHME :
 *   1. Filtrer les deals à ignorer (balance, credit, positionId = 0)
 *   2. Regrouper tous les deals par positionId
 *   3. Pour chaque groupe, construire un CreateTradeInput :
 *      - Deal "in" → side, entryPrice, volume, openedAt, SL, TP
 *      - Deal "out" → exitPrice, closedAt, status = "closed"
 *      - Σ financiers → commission, swap, fees, grossPnl, netPnl
 *   4. Ignorer les groupes sans deal "in" (données incomplètes)
 *
 * @param deals   — deals bruts retournés par le bridge Python
 * @param ctx     — contexte du compte MT5
 * @returns       — trades prêts pour insertion/déduplication
 */
export function mapDealsToTrades(
  deals: MT5RawDeal[],
  ctx: MT5MappingContext = {},
): CreateTradeInput[] {
  if (deals.length === 0) return [];

  // ── Étape 1 : filtrer les deals non-trade ─────────────────────
  const relevantDeals = deals.filter(
    (d) => !IGNORED_DEAL_TYPES.has(d.type) && d.positionId > 0,
  );

  if (relevantDeals.length === 0) {
    logger.debug("mapDealsToTrades : aucun deal après filtrage");
    return [];
  }

  // ── Étape 2 : regrouper par positionId ────────────────────────
  const groupMap = new Map<number, DealGroup>();

  for (const deal of relevantDeals) {
    let group = groupMap.get(deal.positionId);
    if (!group) {
      group = { positionId: deal.positionId, allDeals: [], entryDeals: [], exitDeals: [] };
      groupMap.set(deal.positionId, group);
    }
    group.allDeals.push(deal);
    if (isTradingDeal(deal)) {
      if (isEntryDeal(deal)) group.entryDeals.push(deal);
      else if (isExitDeal(deal)) group.exitDeals.push(deal);
    }
  }

  // ── Étape 3 : mapper chaque groupe ───────────────────────────
  const trades: CreateTradeInput[] = [];

  for (const group of groupMap.values()) {
    const mapped = mapDealGroupToTrade(group, ctx);
    if (mapped !== null) {
      trades.push(mapped);
    }
  }

  logger.debug(
    `mapDealsToTrades : ${deals.length} deals → ${groupMap.size} groupes → ${trades.length} trades`,
  );
  return trades;
}

/**
 * Mappe un groupe de deals (même positionId) vers un CreateTradeInput.
 * Retourne null si le groupe ne peut pas être mappé (données incomplètes).
 */
function mapDealGroupToTrade(
  group: DealGroup,
  ctx: MT5MappingContext,
): CreateTradeInput | null {
  const { positionId, allDeals, entryDeals, exitDeals } = group;

  // Un groupe sans deal "in" est un cas anormal (partial history, etc.)
  if (entryDeals.length === 0) {
    logger.debug(
      `mapDealGroupToTrade : positionId=${positionId} ignoré (aucun deal "in")`,
    );
    return null;
  }

  // Prendre le premier deal "in" comme référence d'ouverture
  // (Pour scaling-in, c'est l'ouverture initiale qui définit le trade)
  // Trier par time pour avoir le premier
  entryDeals.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const primaryEntry = entryDeals[0];

  // Vérifier que le type est un trade réel (buy ou sell)
  if (!isTradingDeal(primaryEntry)) {
    logger.debug(
      `mapDealGroupToTrade : positionId=${positionId} ignoré (type d'ouverture non-trade: ${primaryEntry.type})`,
    );
    return null;
  }

  // Deal de fermeture : prendre le dernier (si partiel, c'est le plus récent)
  exitDeals.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const primaryExit = exitDeals.length > 0 ? exitDeals[exitDeals.length - 1] : null;

  // ── Somme des champs financiers sur TOUS les deals du groupe ──
  let sumProfit = 0;
  let sumCommission = 0;
  let sumSwap = 0;
  let sumFee = 0;

  for (const deal of allDeals) {
    sumProfit += deal.profit;
    sumCommission += deal.commission;
    sumSwap += deal.swap;
    sumFee += deal.fee;
  }

  // netPnl = profit brut + frais (commissions généralement négatives)
  const netPnl = sumProfit + sumCommission + sumSwap + sumFee;

  // ── Statut : fermé si on a un deal de sortie, sinon ouvert ────
  const status: TradeStatus = primaryExit !== null ? "closed" : "open";
  const side = primaryEntry.type as TradeSide;
  const stopLoss = findLatestPositiveDealValue(allDeals, "sl");
  const takeProfit = findLatestPositiveDealValue(allDeals, "tp");
  const riskReward = computeRiskReward(
    primaryEntry.price,
    stopLoss,
    takeProfit,
    side,
  );
  const riskAmount = computeRiskDistance(primaryEntry.price, stopLoss, side);
  const rewardAmount = computeRewardDistance(primaryEntry.price, takeProfit, side);

  return {
    externalId: mt5ExternalId(positionId),
    platform: "mt5",
    source: "mt5",
    broker: ctx.broker ?? ctx.server ?? null,
    accountId: ctx.accountId ?? (ctx.account ? String(ctx.account) : null),
    currency: ctx.currency ?? "USD",

    symbol: primaryEntry.symbol,
    side,

    status,
    openedAt: primaryEntry.time,
    closedAt: primaryExit ? primaryExit.time : null,

    entryPrice: primaryEntry.price,
    exitPrice: primaryExit ? primaryExit.price : null,

    // SL/TP du premier deal d'entrée (0 → null selon convention MT5)
    stopLoss,
    takeProfit,

    volume: primaryEntry.volume,

    commission: sumCommission,
    swap: sumSwap,
    fees: sumFee,

    // grossPnl = profit des deals trading seulement
    // netPnl = profit + tous les frais
    grossPnl: primaryExit !== null ? sumProfit : null,
    netPnl: primaryExit !== null ? netPnl : null,
    riskAmount,
    rewardAmount,
    riskRewardRatio: riskReward?.ratio ?? null,
  };
}

// ─── Mapping positions ouvertes → trades ouverts ───────────

/**
 * Mappe une seule position ouverte MT5 vers un CreateTradeInput.
 *
 * La position sera insérée avec status = "open".
 * Si la position est déjà dans SQLite (via externalId), la déduplication
 * décidera si elle doit être mise à jour ou ignorée.
 */
export function mapPositionToTrade(
  position: MT5RawPosition,
  ctx: MT5MappingContext = {},
): CreateTradeInput {
  // netPnl non réalisé = profit + swap
  // (commission d'ouverture est séparée dans le champ `commission`)
  const netPnl = position.profit + position.swap;
  const stopLoss = position.stopLoss > 0 ? position.stopLoss : null;
  const takeProfit = position.takeProfit > 0 ? position.takeProfit : null;
  const side = position.type as TradeSide;
  const riskReward = computeRiskReward(
    position.openPrice,
    stopLoss,
    takeProfit,
    side,
  );
  const riskAmount = computeRiskDistance(position.openPrice, stopLoss, side);
  const rewardAmount = computeRewardDistance(position.openPrice, takeProfit, side);

  return {
    externalId: mt5ExternalId(position.positionId),
    platform: "mt5",
    source: "mt5",
    broker: ctx.broker ?? ctx.server ?? null,
    accountId: ctx.accountId ?? (ctx.account ? String(ctx.account) : null),
    currency: ctx.currency ?? "USD",

    symbol: position.symbol,
    side,

    status: "open",
    openedAt: position.openTime,
    closedAt: null,

    entryPrice: position.openPrice,
    exitPrice: null,

    // SL/TP : 0 → null (convention MT5)
    stopLoss,
    takeProfit,

    volume: position.volume,

    commission: position.commission,
    swap: position.swap,
    fees: 0,

    // grossPnl = profit floating (avant frais — valeur MT5 directe)
    // netPnl  = profit + swap (commission déjà dans `commission`)
    grossPnl: position.profit,
    netPnl,
    riskAmount,
    rewardAmount,
    riskRewardRatio: riskReward?.ratio ?? null,
  };
}

function findLatestPositiveDealValue(
  deals: MT5RawDeal[],
  field: "sl" | "tp",
): number | null {
  const sortedDeals = [...deals].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  for (let i = sortedDeals.length - 1; i >= 0; i--) {
    const value = sortedDeals[i][field];
    if (Number.isFinite(value) && value > 0) {
      return value;
    }

    const commentValue = parseDealLevelFromComment(sortedDeals[i].comment, field);
    if (commentValue !== null) {
      return commentValue;
    }
  }

  return null;
}

function parseDealLevelFromComment(
  comment: string | null | undefined,
  field: "sl" | "tp",
): number | null {
  if (!comment) return null;

  const match = comment.match(
    new RegExp(`\\[\\s*${field}\\s+(-?\\d+(?:[.,]\\d+)?)\\s*\\]`, "i"),
  );
  if (!match) return null;

  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Mappe un tableau de positions ouvertes MT5 vers des CreateTradeInput[].
 *
 * @param positions — positions brutes retournées par le bridge Python
 * @param ctx       — contexte du compte MT5
 * @returns         — trades ouverts prêts pour insertion/déduplication
 */
export function mapPositionsToTrades(
  positions: MT5RawPosition[],
  ctx: MT5MappingContext = {},
): CreateTradeInput[] {
  if (positions.length === 0) return [];

  const trades = positions.map((pos) => mapPositionToTrade(pos, ctx));
  logger.debug(
    `mapPositionsToTrades : ${positions.length} positions → ${trades.length} trades ouverts`,
  );
  return trades;
}
