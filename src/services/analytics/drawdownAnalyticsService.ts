// ============================================================
// Service — Analytics Drawdown
// ============================================================
// Phase 7 — Étape 5 : Analyse du drawdown.
//
// Construit une equity curve à partir des trades fermés et calcule
// les métriques de drawdown :
//   - drawdown actuel
//   - drawdown maximum (valeur absolue et %)
//   - drawdown moyen
//   - dates du drawdown maximum (début = pic, fin = creux)
//   - trades nécessaires pour la récupération
//
// FORMULE EQUITY CURVE :
//   - Trier les trades fermés par `closed_at` (chronologique)
//   - equity[i] = somme cumulative des net_pnl jusqu'au trade i
//   - peak[i]   = max(equity[0..i])            (≥ 0, part de 0)
//   - drawdown[i]  = equity[i] − peak[i]       (toujours ≤ 0)
//   - ddPct[i]    = drawdown[i] / peak[i] × 100 (si peak[i] > 0, sinon 0)
//
// CONVENTION : l'equity part de 0 avant tout trade.
//   Si les premiers trades sont des pertes, le drawdown commence
//   immédiatement (peak reste 0, ddPct = 0 car division par zéro évitée).
//
// Architecture :
//   AnalyticsPage (React)
//     └── getDrawdownStats()           ← ici
//           └── findTrades(closed)      ← tradesRepository
//                 └── SQLite
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  DrawdownPoint,
  DrawdownStats,
  DrawdownResult,
} from "../../types/analytics";

const logger = createLogger("analytics.drawdown");

// ============================================================
// Helpers de calcul — fonctions pures, sans effet de bord
// ============================================================

/**
 * Détermine la devise majoritaire parmi les trades.
 * Retourne "USD" par défaut si la liste est vide.
 */
function dominantCurrency(trades: Trade[]): string {
  const freq: Record<string, number> = {};
  for (const t of trades) {
    freq[t.currency] = (freq[t.currency] ?? 0) + 1;
  }
  let best = "USD";
  let max = 0;
  for (const [currency, count] of Object.entries(freq)) {
    if (count > max) {
      max = count;
      best = currency;
    }
  }
  return best;
}

/**
 * Retourne le net_pnl d'un trade.
 * Priorité : champ stocké `netPnl` → calcul depuis gross_pnl − frais.
 */
function netPnlOf(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/**
 * Construit la courbe d'équité point par point.
 *
 * Chaque point correspond à la clôture d'un trade (dans l'ordre de `trades`).
 * L'equity cumulative part de 0 ; le pic (peak) est le maximum atteint
 * jusqu'à ce point, initialisé à 0.
 *
 * @param trades - Trades déjà triés par `closedAt` (chronologique).
 * @returns Un tableau de DrawdownPoint, un par trade.
 */
function buildCurve(trades: Trade[]): DrawdownPoint[] {
  let equity = 0;
  let peak = 0;
  const curve: DrawdownPoint[] = [];

  for (const t of trades) {
    equity += netPnlOf(t);

    // Le pic ne peut que croître (ou rester stable)
    if (equity > peak) peak = equity;

    const drawdown = equity - peak; // toujours ≤ 0
    // Éviter la division par zéro : si peak = 0, ddPct = 0
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;

    curve.push({
      date: (t.closedAt ?? "").substring(0, 10),
      equity,
      peak,
      drawdown,
      drawdownPct,
    });
  }

  return curve;
}

/**
 * Calcule toutes les statistiques de drawdown depuis une courbe d'équité.
 *
 * @param curve    - Points de la courbe (produits par buildCurve).
 * @param currency - Devise pour les métadonnées.
 */
function computeStats(curve: DrawdownPoint[], currency: string): DrawdownStats {
  const totalTrades = curve.length;

  // ── Drawdown actuel (dernier point de la courbe) ──────────
  const last = curve[totalTrades - 1];
  const finalEquity = last.equity;
  const currentDrawdown = last.drawdown;
  const currentDrawdownPct = last.drawdownPct;

  // ── Drawdown maximum (point le plus bas de la courbe) ──────
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let maxDrawdownIdx = -1;

  for (let i = 0; i < totalTrades; i++) {
    if (curve[i].drawdown < maxDrawdown) {
      maxDrawdown = curve[i].drawdown;
      maxDrawdownPct = curve[i].drawdownPct;
      maxDrawdownIdx = i;
    }
  }

  // ── Dates du drawdown maximum ──────────────────────────────
  let maxDrawdownStartDate: string | null = null;
  let maxDrawdownEndDate: string | null = null;

  if (maxDrawdownIdx >= 0) {
    maxDrawdownEndDate = curve[maxDrawdownIdx].date;

    // Remonter en arrière pour trouver le dernier point
    // où le drawdown était nul (= le sommet avant la chute).
    // On utilise un epsilon pour l'égalité flottante.
    for (let i = maxDrawdownIdx - 1; i >= 0; i--) {
      if (Math.abs(curve[i].drawdown) < 1e-10) {
        maxDrawdownStartDate = curve[i].date;
        break;
      }
    }

    // Si aucun point antérieur n'avait un drawdown nul
    // (l'equity était déjà en territoire négatif dès le départ),
    // on utilise la date du premier trade comme origine.
    if (maxDrawdownStartDate === null) {
      maxDrawdownStartDate = curve[0].date;
    }
  }

  // ── Drawdown moyen (uniquement sur les points en drawdown) ──
  const ddPoints = curve.filter((p) => p.drawdown < 0);
  const avgDrawdown =
    ddPoints.length > 0
      ? ddPoints.reduce((sum, p) => sum + p.drawdown, 0) / ddPoints.length
      : 0;

  // ── Récupération après le drawdown maximum ────────────────
  // Nombre de trades depuis le creux jusqu'à ce que l'equity
  // repasse au-dessus du pic précédant le drawdown maximum.
  let recoveryTrades: number | null = null;

  if (maxDrawdownIdx >= 0 && maxDrawdownIdx < totalTrades - 1) {
    const peakAtMaxDD = curve[maxDrawdownIdx].peak;
    for (let i = maxDrawdownIdx + 1; i < totalTrades; i++) {
      if (curve[i].equity >= peakAtMaxDD) {
        recoveryTrades = i - maxDrawdownIdx;
        break;
      }
    }
    // Si la boucle se termine sans trouver : le compte n'a pas
    // encore récupéré → recoveryTrades reste null.
  }

  return {
    totalTrades,
    currency,
    finalEquity,
    currentDrawdown,
    currentDrawdownPct,
    maxDrawdown,
    maxDrawdownPct,
    maxDrawdownStartDate,
    maxDrawdownEndDate,
    avgDrawdown,
    recoveryTrades,
  };
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule la courbe d'équité et les statistiques de drawdown
 * depuis les trades fermés.
 *
 * Seuls les trades avec `status = "closed"` sont inclus :
 *   - Les trades ouverts ont un P&L non réalisé → biais dans les stats.
 *   - Les trades annulés n'ont pas eu lieu.
 *
 * L'ordre de tri est `closed_at` (chronologique) car le drawdown
 * est une mesure temporelle : un même ensemble de trades triés
 * différemment donnerait une courbe et un drawdown différents.
 *
 * @param filters - Filtres optionnels (dateRange, symbol, strategyId…)
 * @returns Courbe d'équité complète + statistiques de drawdown.
 */
export async function getDrawdownStats(
  filters?: TradeFilters,
): Promise<DrawdownResult> {
  logger.debug("Calcul des statistiques de drawdown", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { stats: null, curve: [], isEmpty: true };
  }

  // Trier par date de fermeture : le drawdown dépend de l'ordre temporel
  const sorted = [...trades].sort((a, b) =>
    (a.closedAt ?? "").localeCompare(b.closedAt ?? ""),
  );

  const currency = dominantCurrency(sorted);
  const curve = buildCurve(sorted);
  const stats = computeStats(curve, currency);

  logger.debug("Statistiques drawdown calculées", {
    total: stats.totalTrades,
    maxDD: stats.maxDrawdown,
    maxDDPct: stats.maxDrawdownPct,
    recoveryTrades: stats.recoveryTrades,
  });

  return { stats, curve, isEmpty: false };
}
