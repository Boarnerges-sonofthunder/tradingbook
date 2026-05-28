// ============================================================
// MT4 Mapping Service — TradingBook
// ============================================================
// Phase 6 Étape 2.1 — Architecture préparée (NON IMPLÉMENTÉ)
//
// RESPONSABILITÉS (futures) :
//   - Convertir les MT4RawOrder en CreateTradeInput (format TradingBook)
//   - Filtrer les entrées non-trade (balance, credit, ordres ouverts)
//   - Normaliser les valeurs (lots, prix, devise, sens)
//   - Calculer grossPnl et netPnl à partir des données MT4
//   - Remplir les champs broker, accountId, platform = "mt4", source = "mt4"
//
// MAPPING MT4 → TRADINGBOOK :
//   MT4 RawOrder field  │ Trade field          │ Notes
//   ────────────────────┼──────────────────────┼──────────────────────────
//   ticket              │ externalId           │ converti en string
//   openTime            │ openedAt             │ déjà ISO 8601
//   closeTime           │ closedAt             │ peut être null (ouvert)
//   type ("buy"/"sell") │ side                 │ filtrer les autres types
//   size                │ volume               │ en lots
//   symbol              │ symbol               │ normaliser (ex: "EURUSD")
//   openPrice           │ entryPrice           │
//   closePrice          │ exitPrice            │ null si ouvert
//   stopLoss            │ stopLoss             │ 0.0 → null (convention MT4)
//   takeProfit          │ takeProfit           │ 0.0 → null (convention MT4)
//   commission          │ commission           │ valeur absolue
//   swap                │ swap                 │ valeur absolue
//   profit              │ grossPnl             │ profit brut
//   profit+commission   │ netPnl               │ calculé côté mapping
//   +swap               │                      │
//   comment             │ (non stocké)         │ utilisé pour magic si EA
//   magicNumber         │ (non stocké)         │ à ajouter si besoin futur
//   "mt4"               │ platform, source     │ constant
//
// DIFFÉRENCES DE CALCUL MT4 vs MT5 :
//   MT4 : profit = P&L brut de la position (closePrice - openPrice) * size
//         netPnl = profit + commission + swap  (les trois sont séparés)
//
//   MT5 : spread sur plusieurs deals (entry deal + exit deal)
//         netPnl = sum(deal.profit + deal.commission + deal.swap + deal.fee)
//
// ÉTAT : 🔲 NON IMPLÉMENTÉ — stubs architecturaux uniquement
// ============================================================

import { createLogger } from "../logging";
import type { MT4RawOrder, MT4MappingResult } from "../../types/mt4";
import type { CreateTradeInput } from "../../types/trade";

const logger = createLogger("mt4-mapping");

// ─── Erreur de non-implémentation ──────────────────────────

class MT4NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `MT4MappingService.${method}() — non implémenté (Phase 6 Étape future).`,
    );
    this.name = "MT4NotImplementedError";
  }
}

// ─── Fonctions publiques (stubs) ───────────────────────────

/**
 * Convertit un tableau de MT4RawOrder en CreateTradeInput[].
 *
 * Filtre automatiquement :
 *   - Les entrées de type "balance" et "credit"
 *   - Les orders encore ouverts (closeTime = null)
 *   - Les orders avec symbol vide ou size = 0
 *   - Les types non supportés (buy_limit, sell_limit, buy_stop, sell_stop)
 *     → ces types représentent des ordres en attente, pas des positions
 *
 * @param orders  - Liste de MT4RawOrder bruts du fichier d'export
 * @param account - Numéro de compte MT4 (pour remplir accountId)
 * @param broker  - Nom du broker (pour remplir broker)
 * @param importId - ID de session d'import dans SQLite (import_id)
 *
 * @returns Résultat avec les trades mappés et les ordres ignorés.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export async function mapMT4Orders(
  orders: MT4RawOrder[],
  account: number,
  broker: string,
  importId: number,
): Promise<{ trades: CreateTradeInput[]; summary: MT4MappingResult }> {
  logger.debug(`mapMT4Orders() appelé — ${orders.length} orders reçus`);
  void account;
  void broker;
  void importId;
  throw new MT4NotImplementedError("mapMT4Orders");
}

/**
 * Calcule le P&L net d'un order MT4 clôturé.
 *
 * Formule : netPnl = profit + commission + swap
 *
 * Note : dans MT4, `commission` et `swap` sont souvent négatifs
 * (ils représentent des coûts). Le netPnl est donc généralement
 * inférieur au profit brut.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export function calculateMT4NetPnl(
  profit: number,
  commission: number,
  swap: number,
): number {
  void profit;
  void commission;
  void swap;
  throw new MT4NotImplementedError("calculateMT4NetPnl");
}

/**
 * Normalise un stopLoss ou takeProfit MT4.
 *
 * Convention MT4 : 0.0 signifie "non défini".
 * TradingBook stocke null pour "non défini".
 *
 * @returns La valeur si > 0, sinon null.
 *
 * @todo Implémenter en Phase 6 Étape MT4.
 */
export function normalizeMT4Price(value: number): number | null {
  void value;
  throw new MT4NotImplementedError("normalizeMT4Price");
}
