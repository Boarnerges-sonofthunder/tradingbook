// ============================================================
// Types — Analytics / Dashboard
// ============================================================
// Structures de données produites par les services analytics.
// Ne pas importer SQLite ici : ces types sont purement applicatifs.
// ============================================================

/**
 * Statistiques globales calculées sur un ensemble de trades fermés.
 * Toutes les valeurs monétaires utilisent la devise majoritaire du portefeuille.
 */
import type { TradePlatform, TradeSide } from "./trade";

export interface DashboardStats {
  // ── P&L ─────────────────────────────────────────────────
  /** Somme du net_pnl de tous les trades fermés. */
  totalNetPnl: number;
  /** Devise majoritaire parmi les trades (ex. "USD"). */
  currency: string;

  // ── Nombre de trades ─────────────────────────────────────
  /** Nombre total de trades fermés inclus dans le calcul. */
  totalTrades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl === 0 (exactly break-even). */
  breakevenTrades: number;

  // ── Ratios ───────────────────────────────────────────────
  /** Pourcentage de trades gagnants sur le total (0–100). */
  winRate: number;

  // ── Moyennes ─────────────────────────────────────────────
  /** P&L moyen des trades gagnants (valeur positive). */
  averageWin: number;
  /**
   * P&L moyen des trades perdants (valeur négative).
   * Vaut 0 si aucun trade perdant.
   */
  averageLoss: number;

  // ── Risque ───────────────────────────────────────────────
  /**
   * Profit factor = somme(gains) / |somme(pertes)|.
   * Vaut Infinity s'il n'y a aucun trade perdant.
   * Vaut 0 s'il n'y a aucun trade gagnant.
   */
  profitFactor: number;
  /**
   * Drawdown maximum absolu en devise :
   * plus grand écart pic→creux de la courbe des profits cumulés,
   * calculé dans l'ordre chronologique des clôtures.
   */
  maxDrawdown: number;

  // ── Extrêmes ─────────────────────────────────────────────
  /** net_pnl du meilleur trade unique. */
  bestTrade: number;
  /** net_pnl du pire trade unique (valeur négative ou nulle). */
  worstTrade: number;
}

/**
 * Résultat retourné par `getDashboardStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface DashboardStatsResult {
  stats: DashboardStats | null;
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PnL — Phase 7, Étape 2
// ============================================================

/**
 * Statistiques détaillées du Profit and Loss calculées sur les trades fermés.
 * Toutes les valeurs monétaires sont dans la devise majoritaire.
 */
export interface PnLStats {
  // ── Totaux ───────────────────────────────────────────────
  /** Somme des net_pnl de tous les trades fermés (après tous les frais). */
  totalNetPnl: number;
  /** Somme des gross_pnl (avant déduction des frais). */
  totalGrossPnl: number;
  /** Somme des commissions de courtage (coût, toujours ≥ 0). */
  totalCommissions: number;
  /** Somme des swaps (frais de financement nocturne, peut être + ou −). */
  totalSwap: number;
  /** Somme des autres frais divers. */
  totalFees: number;

  // ── Moyennes ─────────────────────────────────────────────
  /** Moyenne du net_pnl par trade (totalNetPnl / totalTrades). */
  averagePnl: number;

  // ── Extrêmes ─────────────────────────────────────────────
  /** net_pnl du trade le plus profitable. */
  bestTrade: number;
  /** net_pnl du trade le plus coûteux (valeur négative ou 0). */
  worstTrade: number;

  // ── Positif / Négatif ────────────────────────────────────
  /** Somme de tous les net_pnl > 0 (gains bruts cumulés). */
  totalPositivePnl: number;
  /** Somme de tous les net_pnl < 0 (pertes brutes cumulées, valeur négative). */
  totalNegativePnl: number;

  // ── Métadonnées ───────────────────────────────────────────
  /** Nombre de trades fermés inclus dans le calcul. */
  totalTrades: number;
  /** Devise majoritaire parmi les trades (ex. "USD"). */
  currency: string;
}

/**
 * Un point de la série temporelle du PnL pour une période donnée.
 */
export interface PnLPeriodEntry {
  /**
   * Identifiant de la période (format dépend du type de groupement) :
   *   - Par jour   : "2024-01-15"
   *   - Par semaine : "2024-W03"
   *   - Par mois   : "2024-01"
   */
  period: string;
  /** Somme des net_pnl sur cette période. */
  netPnl: number;
  /** Nombre de trades fermés sur cette période. */
  tradeCount: number;
}

/**
 * Décomposition du PnL par périodes temporelles.
 * Les trois granularités couvrent tous les usages d'analyse.
 */
export interface PnLBreakdown {
  /** PnL agrégé par jour de clôture, trié chronologiquement. */
  byDay: PnLPeriodEntry[];
  /** PnL agrégé par semaine ISO (ex. "2024-W03"), trié chronologiquement. */
  byWeek: PnLPeriodEntry[];
  /** PnL agrégé par mois (ex. "2024-01"), trié chronologiquement. */
  byMonth: PnLPeriodEntry[];
}

/**
 * Résultat complet retourné par `getPnLStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface PnLResult {
  stats: PnLStats | null;
  breakdown: PnLBreakdown | null;
  isEmpty: boolean;
}

// ============================================================
// ANALYSE WIN RATE — Phase 7, Étape 3
// ============================================================

/**
 * Statistiques globales de win rate calculées sur les trades fermés.
 *
 * Règles de classification :
 *   gagnant  = net_pnl > 0
 *   perdant  = net_pnl < 0
 *   breakeven = net_pnl === 0
 */
export interface WinRateStats {
  // ── Compteurs ────────────────────────────────────────────
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  // ── Taux (0–100) ─────────────────────────────────────────
  /** Pourcentage de trades gagnants. winningTrades / totalTrades × 100 */
  winRate: number;
  /** Pourcentage de trades perdants. losingTrades / totalTrades × 100 */
  lossRate: number;
  /** Pourcentage de trades breakeven. breakevenTrades / totalTrades × 100 */
  breakevenRate: number;
}

/** Win rate pour un symbole donné. */
export interface WinRateBySymbol {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  /** Pourcentage de trades gagnants sur ce symbole. */
  winRate: number;
}

/** Win rate pour une stratégie donnée (ou sans stratégie). */
export interface WinRateByStrategy {
  strategyId: number | null;
  /** Nom de la stratégie ou "Sans stratégie" si strategyId est null. */
  strategyName: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
}

/** Win rate pour une période mensuelle. */
export interface WinRatePeriodEntry {
  /** Format "2024-01" (année-mois). */
  period: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
}

/**
 * Résultat complet retourné par `getWinRateStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface WinRateResult {
  stats: WinRateStats | null;
  bySymbol: WinRateBySymbol[];
  byStrategy: WinRateByStrategy[];
  byMonth: WinRatePeriodEntry[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE RISK/REWARD — Phase 7, Étape 4
// ============================================================

/**
 * Statistiques globales de Risk/Reward calculées sur les trades fermés.
 *
 * Un trade est "exploitable" si son R/R peut être déterminé :
 *   - soit via le champ `riskRewardRatio` déjà stocké (> 0, fini)
 *   - soit en calculant reward / risk depuis entryPrice / stopLoss / takeProfit
 *
 * Les trades sans SL ni TP contribuent uniquement aux statistiques
 * de couverture (pctWithSL, pctWithTP).
 */
export interface RiskRewardStats {
  /** Nombre total de trades fermés inclus dans le calcul. */
  totalTrades: number;
  /** Trades pour lesquels un R/R valide a pu être calculé. */
  exploitableTrades: number;

  // ── Couverture SL / TP ───────────────────────────────────
  /** Trades dont le stop-loss est renseigné (non null). */
  tradesWithSL: number;
  /** Trades dont le take-profit est renseigné (non null). */
  tradesWithTP: number;
  /** Trades sans stop-loss. */
  tradesWithoutSL: number;
  /** Trades sans take-profit. */
  tradesWithoutTP: number;
  /** Pourcentage de trades avec SL (0–100). */
  pctWithSL: number;
  /** Pourcentage de trades avec TP (0–100). */
  pctWithTP: number;

  // ── Ratios R/R ───────────────────────────────────────────
  /**
   * Ratio Risk/Reward moyen des trades exploitables.
   * Null si aucun trade exploitable.
   */
  avgRR: number | null;
  /**
   * Meilleur ratio R/R observé (le plus élevé).
   * Null si aucun trade exploitable.
   */
  bestRR: number | null;
  /**
   * Pire ratio R/R observé (le plus faible).
   * Null si aucun trade exploitable.
   */
  worstRR: number | null;
}

/** Statistiques Risk/Reward pour un symbole donné. */
export interface RiskRewardBySymbol {
  symbol: string;
  /** Nombre total de trades fermés sur ce symbole. */
  totalTrades: number;
  /** Trades avec un R/R calculable sur ce symbole. */
  exploitableTrades: number;
  /** R/R moyen sur ce symbole. Null si aucun trade exploitable. */
  avgRR: number | null;
}

/** Statistiques Risk/Reward pour une stratégie donnée (ou sans stratégie). */
export interface RiskRewardByStrategy {
  strategyId: number | null;
  /** Nom de la stratégie ou "Sans stratégie" si strategyId est null. */
  strategyName: string;
  totalTrades: number;
  exploitableTrades: number;
  avgRR: number | null;
}

/**
 * Résultat complet retourné par `getRiskRewardStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface RiskRewardResult {
  stats: RiskRewardStats | null;
  bySymbol: RiskRewardBySymbol[];
  byStrategy: RiskRewardByStrategy[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE DRAWDOWN — Phase 7, Étape 5
// ============================================================

/**
 * Un point de la courbe d'équité.
 *
 * Chaque point correspond à la clôture d'un trade (trié par `closed_at`).
 * L'equity part de 0 (P&L cumulé nul avant tout trade).
 */
export interface DrawdownPoint {
  /** Date de clôture du trade au format "YYYY-MM-DD". */
  date: string;
  /** P&L cumulé à ce point (somme des net_pnl depuis le début). */
  equity: number;
  /** Sommet d'equity atteint jusqu'à ce point inclus. Toujours ≥ 0. */
  peak: number;
  /**
   * Drawdown absolu = equity − peak.
   * Toujours ≤ 0. Vaut 0 quand l'equity est à son sommet.
   */
  drawdown: number;
  /**
   * Drawdown en pourcentage du pic = (drawdown / peak) × 100.
   * Toujours ≤ 0. Vaut 0 si peak = 0 (aucun sommet positif).
   */
  drawdownPct: number;
}

/**
 * Statistiques globales de drawdown calculées sur la courbe d'équité.
 */
export interface DrawdownStats {
  /** Nombre total de trades fermés analysés. */
  totalTrades: number;
  /** Devise majoritaire des trades (ex. "USD"). */
  currency: string;

  // ── Equity ───────────────────────────────────────────────
  /** P&L cumulé final (equity au dernier trade). */
  finalEquity: number;

  // ── Drawdown actuel ───────────────────────────────────────
  /** Drawdown absolu au dernier point. Vaut 0 si equity est au sommet. */
  currentDrawdown: number;
  /** Drawdown actuel en % du pic. */
  currentDrawdownPct: number;

  // ── Drawdown maximum ──────────────────────────────────────
  /** Drawdown le plus sévère observé (valeur absolue ≤ 0). */
  maxDrawdown: number;
  /** Drawdown maximum en % du pic (valeur ≤ 0). */
  maxDrawdownPct: number;
  /**
   * Date du dernier sommet d'equity avant le drawdown maximum.
   * Null si aucun drawdown n'a eu lieu.
   */
  maxDrawdownStartDate: string | null;
  /**
   * Date du point le plus bas (drawdown maximum).
   * Null si aucun drawdown n'a eu lieu.
   */
  maxDrawdownEndDate: string | null;

  // ── Drawdown moyen ────────────────────────────────────────
  /**
   * Moyenne des valeurs de drawdown sur les seuls points en drawdown.
   * Vaut 0 si aucun point n'est en drawdown.
   */
  avgDrawdown: number;

  // ── Récupération ─────────────────────────────────────────
  /**
   * Nombre de trades nécessaires après le drawdown maximum
   * pour que l'equity repasse au-dessus du pic précédant.
   * Null si la récupération n'a pas encore eu lieu.
   */
  recoveryTrades: number | null;
}

/**
 * Résultat complet retourné par `getDrawdownStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface DrawdownResult {
  stats: DrawdownStats | null;
  /**
   * Courbe d'équité complète : un point par trade fermé,
   * trié par date de clôture (chronologique).
   */
  curve: DrawdownPoint[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE COURBE D'EQUITE — Phase 7, Etape 13
// ============================================================

/**
 * Point de courbe d'equite apres la cloture d'un trade.
 *
 * La courbe part de 0 avant le premier trade et ajoute le `net_pnl`
 * de chaque trade ferme dans l'ordre chronologique de `closed_at`.
 */
export interface EquityCurvePoint {
  /** ID du trade source dans SQLite. */
  tradeId: number;
  /** Position chronologique du trade dans la courbe, en base 1. */
  index: number;
  /** Date de cloture au format "YYYY-MM-DD". */
  date: string;
  /** Horodatage complet de cloture, utilise pour les egalites de date. */
  closedAt: string;
  /** Symbole du trade source. */
  symbol: string;
  /** PnL net du trade ajoute a ce point. */
  netPnl: number;
  /** PnL net cumulatif apres ce trade. */
  equity: number;
  /** Plus haut niveau d'equite atteint jusqu'a ce point. */
  peak: number;
  /** Drawdown associe a ce point = equity - peak. */
  drawdown: number;
  /** Drawdown en pourcentage du peak, vaut 0 si peak <= 0. */
  drawdownPct: number;
}

/**
 * Point journalier de courbe d'equite.
 * `equity` correspond au niveau de fin de jour apres tous les trades fermes.
 */
export interface EquityDatePoint {
  /** Date de cloture au format "YYYY-MM-DD". */
  date: string;
  /** Somme des net_pnl des trades fermes sur cette date. */
  netPnl: number;
  /** Equity cumulative a la fin de cette date. */
  equity: number;
  /** Nombre de trades fermes sur cette date. */
  tradeCount: number;
}

/**
 * Statistiques globales derivees de la courbe d'equite.
 */
export interface EquityCurveStats {
  /** Nombre total de trades fermes inclus. */
  totalTrades: number;
  /** Devise majoritaire des trades. */
  currency: string;
  /** Equity de depart, toujours 0 dans cette analyse. */
  startEquity: number;
  /** Equity finale apres le dernier trade ferme. */
  finalEquity: number;
  /** Variation totale depuis le depart, egale a finalEquity - startEquity. */
  totalVariation: number;
  /** Plus haut sommet d'equite observe. */
  highestPeak: number;
  /** Date du plus haut sommet d'equite. */
  highestPeakDate: string | null;
  /** Plus bas creux d'equite observe. */
  lowestTrough: number;
  /** Date du plus bas creux d'equite. */
  lowestTroughDate: string | null;
  /** Drawdown maximum associe a la courbe, valeur <= 0. */
  maxDrawdown: number;
  /** Drawdown maximum en pourcentage, valeur <= 0. */
  maxDrawdownPct: number;
  /** Drawdown au dernier point de la courbe. */
  currentDrawdown: number;
  /** Drawdown actuel en pourcentage. */
  currentDrawdownPct: number;
}

/**
 * Resultat complet retourne par `getEquityCurveStats()`.
 */
export interface EquityCurveResult {
  stats: EquityCurveStats | null;
  /** Un point par trade ferme, trie par cloture chronologique. */
  byTrade: EquityCurvePoint[];
  /** Equity agregee par date de cloture, triee chronologiquement. */
  byDate: EquityDatePoint[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PROFIT FACTOR — Phase 7, Etape 6
// ============================================================

/**
 * Statistiques globales du Profit Factor.
 *
 * FORMULE :
 *   profitFactor = totalGains / |totalLosses|
 *
 * CAS SPECIAUX :
 *   - gains > 0, pertes = 0 -> profitFactor = null (represente l'infini)
 *   - gains = 0, pertes > 0 -> profitFactor = 0
 *   - gains = 0, pertes = 0 -> profitFactor = null (tous breakeven)
 */
export interface ProfitFactorStats {
  /** Nombre total de trades fermés analysés. */
  totalTrades: number;
  /** Devise majoritaire des trades (ex. "USD"). */
  currency: string;

  // ── Décomposition gains / pertes ─────────────────────────
  /** Nombre de trades gagnants (net_pnl > 0). */
  winningTrades: number;
  /** Nombre de trades perdants (net_pnl < 0). */
  losingTrades: number;
  /** Nombre de trades breakeven (net_pnl = 0). */
  breakevenTrades: number;

  // ── Montants ─────────────────────────────────────────────
  /** Somme des net_pnl des trades gagnants (toujours ≥ 0). */
  totalGains: number;
  /**
   * Valeur absolue de la somme des net_pnl des trades perdants.
   * Toujours ≥ 0.
   */
  totalLosses: number;

  // ── Profit Factor ─────────────────────────────────────────
  /**
   * Profit Factor global = totalGains / totalLosses.
   *
   * null si totalLosses = 0 (aucun trade perdant → "∞" en UI).
   * 0 si totalGains = 0 et totalLosses > 0.
   */
  profitFactor: number | null;

  // ── Moyennes ─────────────────────────────────────────────
  /** Gain moyen des trades gagnants (≥ 0). 0 si aucun gagnant. */
  avgGain: number;
  /** Perte moyenne des trades perdants en valeur absolue (≥ 0). 0 si aucun perdant. */
  avgLoss: number;
  /**
   * Rapport gain moyen / perte moyenne absolue.
   * Appelé aussi "Payoff Ratio".
   * null si avgLoss = 0.
   */
  payoffRatio: number | null;
}

/**
 * Profit Factor agrégé par symbole (instrument tradé).
 */
export interface ProfitFactorBySymbol {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalGains: number;
  totalLosses: number;
  /** null si pas de pertes sur ce symbole. */
  profitFactor: number | null;
}

/**
 * Profit Factor agrégé par stratégie.
 */
export interface ProfitFactorByStrategy {
  strategyId: number;
  strategyName: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalGains: number;
  totalLosses: number;
  /** null si pas de pertes sur cette stratégie. */
  profitFactor: number | null;
}

/**
 * Profit Factor agrégé par mois calendaire.
 */
export interface ProfitFactorByMonth {
  /** Format "YYYY-MM". */
  month: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalGains: number;
  totalLosses: number;
  /** null si pas de pertes sur ce mois. */
  profitFactor: number | null;
}

/**
 * Résultat complet retourné par `getProfitFactorStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface ProfitFactorResult {
  stats: ProfitFactorStats | null;
  bySymbol: ProfitFactorBySymbol[];
  byStrategy: ProfitFactorByStrategy[];
  byMonth: ProfitFactorByMonth[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE AVERAGE WIN / AVERAGE LOSS — Phase 7, Étape 7
// ============================================================

/**
 * Statistiques globales du gain moyen et de la perte moyenne.
 *
 * FORMULES :
 *   avgWin  = Σ(net_pnl des trades gagnants) / nbGagnants
 *   avgLoss = Σ(net_pnl des trades perdants) / nbPerdants  (valeur négative)
 *   winLossRatio = avgWin / |avgLoss|
 *
 * CONVENTION : les trades breakeven (net_pnl = 0) sont exclus des calculs
 * de moyennes car ils ne reflètent ni un gain ni une perte réelle.
 * Ils sont comptabilisés séparément dans `breakevenTrades`.
 *
 * CAS SPÉCIAUX :
 *   - Aucun gagnant  → avgWin = 0,  winLossRatio = 0
 *   - Aucun perdant  → avgLoss = 0, winLossRatio = null ("∞")
 *   - Aucun trade    → stats = null, isEmpty = true
 */
export interface AvgWinLossStats {
  /** Nombre total de trades fermés analysés. */
  totalTrades: number;
  /** Devise majoritaire des trades (ex. "USD"). */
  currency: string;

  // ── Répartition ───────────────────────────────────────────
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl = 0 (exclus des moyennes). */
  breakevenTrades: number;

  // ── Gain moyen ────────────────────────────────────────────
  /**
   * Gain moyen par trade gagnant (toujours ≥ 0).
   * 0 si aucun trade gagnant.
   */
  avgWin: number;

  // ── Perte moyenne ─────────────────────────────────────────
  /**
   * Perte moyenne par trade perdant (toujours ≤ 0).
   * 0 si aucun trade perdant.
   */
  avgLoss: number;

  // ── Ratio ─────────────────────────────────────────────────
  /**
   * Ratio gain moyen / |perte moyenne|.
   * null si aucun trade perdant (représente "∞" en UI).
   * 0 si aucun trade gagnant (et pertes > 0).
   */
  winLossRatio: number | null;

  // ── Extrêmes ─────────────────────────────────────────────
  /** Meilleur trade unique (net_pnl maximal). 0 si aucun trade. */
  bestTrade: number;
  /** Pire trade unique (net_pnl minimal, toujours ≤ 0). 0 si aucun perdant. */
  worstTrade: number;
}

/**
 * Average Win / Loss agrégé par symbole (instrument tradé).
 */
export interface AvgWinLossBySymbol {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  /** Valeur ≤ 0. 0 si aucun perdant sur ce symbole. */
  avgLoss: number;
  /** null si aucun perdant sur ce symbole. */
  winLossRatio: number | null;
  bestTrade: number;
  worstTrade: number;
}

/**
 * Average Win / Loss agrégé par stratégie.
 */
export interface AvgWinLossByStrategy {
  strategyId: number;
  strategyName: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  /** Valeur ≤ 0. 0 si aucun perdant sur cette stratégie. */
  avgLoss: number;
  /** null si aucun perdant sur cette stratégie. */
  winLossRatio: number | null;
  bestTrade: number;
  worstTrade: number;
}

/**
 * Résultat complet retourné par `getAvgWinLossStats()`.
 * `isEmpty` est true si aucun trade fermé n'existe dans le filtre courant.
 */
export interface AvgWinLossResult {
  stats: AvgWinLossStats | null;
  bySymbol: AvgWinLossBySymbol[];
  byStrategy: AvgWinLossByStrategy[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PAR SYMBOLE — Phase 7, Étape 8
// ============================================================

/**
 * Colonnes disponibles pour le tri du tableau de performance par symbole.
 * Utilisé côté React pour trier sans recalculer les données.
 */
export type SymbolSortKey =
  | "symbol"
  | "totalTrades"
  | "netPnl"
  | "avgPnl"
  | "winRate"
  | "avgWin"
  | "avgLoss"
  | "profitFactor"
  | "avgRR";

/**
 * Statistiques de performance pour un symbole donné.
 *
 * FORMULES :
 *   winRate       = winningTrades / totalTrades × 100
 *   avgPnl        = netPnlTotal / totalTrades
 *   avgWin        = Σ(pnl > 0) / winningTrades  (0 si aucun gagnant)
 *   avgLoss       = Σ(pnl < 0) / losingTrades   (≤ 0 si perdants, 0 sinon)
 *   profitFactor  = totalGains / totalLosses     (null si totalLosses = 0)
 *   avgRR         = Σ(R/R exploitables) / count  (null si aucun R/R dispo)
 *
 * CONVENTIONS :
 *   - avgLoss : valeur ≤ 0, représente la perte moyenne par trade perdant
 *   - profitFactor : null = "∞" (aucune perte sur ce symbole)
 *   - avgRR : null si aucun trade n'a de R/R calculable (pas de SL/TP)
 *   - bestTrade / worstTrade : net_pnl maximal / minimal observé
 */
export interface SymbolStats {
  symbol: string;
  /** Devise majoritaire sur ce symbole. */
  currency: string;
  /** Nombre total de trades fermés. */
  totalTrades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl = 0. */
  breakevenTrades: number;

  // ── P&L ─────────────────────────────────────────────────
  /** Somme de tous les net_pnl (peut être négatif). */
  netPnlTotal: number;
  /** net_pnl moyen par trade (peut être négatif). */
  avgPnl: number;
  /** Meilleur trade individuel (net_pnl max). */
  bestTrade: number;
  /** Pire trade individuel (net_pnl min, ≤ 0). */
  worstTrade: number;

  // ── Win Rate ─────────────────────────────────────────────
  /** Pourcentage de trades gagnants (0–100). */
  winRate: number;

  // ── Gain / Perte moyens ──────────────────────────────────
  /** Gain moyen par trade gagnant (≥ 0). */
  avgWin: number;
  /** Perte moyenne par trade perdant (≤ 0). */
  avgLoss: number;

  // ── Profit Factor ────────────────────────────────────────
  /** Somme brute des gains (net_pnl > 0). */
  totalGains: number;
  /** Somme brute (valeur abs.) des pertes (net_pnl < 0). */
  totalLosses: number;
  /**
   * Ratio totalGains / totalLosses.
   * null si totalLosses = 0 ("∞" en UI).
   * 0 si totalGains = 0 et totalLosses > 0.
   */
  profitFactor: number | null;

  // ── Risk/Reward ──────────────────────────────────────────
  /**
   * R/R moyen calculé sur les trades disposant d'un SL et d'un TP.
   * null si aucun trade exploitable sur ce symbole.
   */
  avgRR: number | null;
  /** Nombre de trades avec un R/R calculable. */
  tradesWithRR: number;
}

/**
 * Résumé agrégé de tous les symboles (méta-stats pour les cards).
 */
export interface SymbolOverviewStats {
  /** Nombre total de symboles distincts tradés. */
  totalSymbols: number;
  /** Devise majoritaire globale. */
  currency: string;
  /** Symbole avec le PnL net total le plus élevé. */
  bestSymbol: string | null;
  /** PnL net total du meilleur symbole. */
  bestSymbolPnl: number;
  /** Symbole avec le PnL net total le plus bas. */
  worstSymbol: string | null;
  /** PnL net total du pire symbole. */
  worstSymbolPnl: number;
  /** Symbole le plus tradé (nombre de trades). */
  mostTradedSymbol: string | null;
  /** Nombre de trades du symbole le plus tradé. */
  mostTradedCount: number;
  /** Symbole avec le meilleur win rate (≥ 5 trades pour être éligible). */
  bestWinRateSymbol: string | null;
  /** Win rate du meilleur symbole. */
  bestWinRate: number;
}

/**
 * Résultat complet retourné par `getSymbolStats()`.
 */
export interface SymbolResult {
  /** Méta-statistiques globales pour les cartes de résumé. */
  overview: SymbolOverviewStats | null;
  /** Détail par symbole — trié par PnL décroissant par défaut. */
  bySymbol: SymbolStats[];
  /** true si aucun trade fermé n'existe. */
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PAR BROKER — Phase 15
// ============================================================

export interface BrokerStats {
  brokerName: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  netPnlTotal: number;
  avgPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalGains: number;
  totalLosses: number;
  profitFactor: number | null;
  currency: string;
}

export interface BrokerOverviewStats {
  totalBrokers: number;
  currency: string;
  bestBroker: string | null;
  bestBrokerPnl: number;
  worstBroker: string | null;
  worstBrokerPnl: number;
  mostTradedBroker: string | null;
  mostTradedCount: number;
  bestWinRateBroker: string | null;
  bestWinRate: number;
}

export interface BrokerResult {
  overview: BrokerOverviewStats | null;
  byBroker: BrokerStats[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PAR STRATÉGIE — Phase 7, Étape 9
// ============================================================

/**
 * Colonnes disponibles pour le tri du tableau de performance par stratégie.
 */
export type StrategySortKey =
  | "strategyName"
  | "totalTrades"
  | "netPnl"
  | "avgPnl"
  | "winRate"
  | "avgWin"
  | "avgLoss"
  | "profitFactor"
  | "avgRR";

/**
 * Statistiques de performance pour une stratégie donnée.
 *
 * GROUPE SPÉCIAL "Sans stratégie" :
 *   Les trades dont `strategyId` est null sont regroupés sous un ID
 *   virtuel (UNASSIGNED_STRATEGY_ID = 0) avec le nom "Sans stratégie".
 *   Ils sont toujours affichés en dernière position dans le tableau.
 *   `isUnassigned` permet à l'UI de les styliser différemment.
 *
 * FORMULES (identiques à SymbolStats) :
 *   winRate       = winningTrades / totalTrades × 100
 *   avgPnl        = netPnlTotal / totalTrades
 *   avgWin        = Σ(pnl > 0) / winningTrades  (0 si aucun gagnant)
 *   avgLoss       = Σ(pnl < 0) / losingTrades   (≤ 0, 0 si aucun perdant)
 *   profitFactor  = totalGains / totalLosses     (null si totalLosses = 0)
 *   avgRR         = Σ(R/R exploitables) / count  (null si aucun R/R)
 */
export interface StrategyStats {
  /**
   * ID de la stratégie (référence vers `strategies.id`).
   * 0 pour le groupe virtuel "Sans stratégie".
   */
  strategyId: number;
  strategyName: string;
  /**
   * true si ce groupe rassemble les trades sans stratégie affectée.
   * false pour toutes les stratégies réelles.
   */
  isUnassigned: boolean;
  /** Devise majoritaire sur cette stratégie. */
  currency: string;
  /** Nombre total de trades fermés. */
  totalTrades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl = 0. */
  breakevenTrades: number;

  // ── P&L ─────────────────────────────────────────────────
  netPnlTotal: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;

  // ── Win Rate ─────────────────────────────────────────────
  winRate: number;

  // ── Gain / Perte moyens ──────────────────────────────────
  avgWin: number;
  /** Valeur ≤ 0. */
  avgLoss: number;

  // ── Profit Factor ────────────────────────────────────────
  totalGains: number;
  totalLosses: number;
  /** null = "∞" (aucune perte sur cette stratégie). */
  profitFactor: number | null;

  // ── Risk/Reward ──────────────────────────────────────────
  /** null si aucun trade exploitable. */
  avgRR: number | null;
  tradesWithRR: number;
}

/**
 * Résumé agrégé de toutes les stratégies (méta-stats pour les cartes).
 */
export interface StrategyOverviewStats {
  /** Nombre total de stratégies ayant au moins un trade fermé. */
  totalStrategies: number;
  /** Nombre de trades sans stratégie affectée. */
  unassignedTrades: number;
  /** Devise majoritaire globale. */
  currency: string;
  /** Stratégie avec le PnL net total le plus élevé (null si aucune stratégie réelle). */
  bestStrategy: string | null;
  bestStrategyPnl: number;
  /** Stratégie avec le PnL net total le plus bas (null si aucune stratégie réelle). */
  worstStrategy: string | null;
  worstStrategyPnl: number;
  /**
   * Stratégie avec le meilleur win rate (seuil : ≥ 5 trades).
   * Exclut le groupe "Sans stratégie".
   */
  bestWinRateStrategy: string | null;
  bestWinRate: number;
  /** Stratégie avec le plus de trades fermés (hors "Sans stratégie"). */
  mostUsedStrategy: string | null;
  mostUsedCount: number;
}

/**
 * Résultat complet retourné par `getStrategyStats()`.
 */
export interface StrategyResult {
  overview: StrategyOverviewStats | null;
  /** Détail par stratégie — trié par PnL décroissant, "Sans stratégie" en dernier. */
  byStrategy: StrategyStats[];
  isEmpty: boolean;
}

// ============================================================
// Phase 7 — Étape 10 : Analytics par Session de Trading
// ============================================================

/**
 * Sessions de marché reconnues par TradingBook.
 *
 * - Asia          : 00:00 – 09:00 UTC
 * - London        : 07:00 – 16:00 UTC
 * - New York      : 12:00 – 21:00 UTC
 * - Overlap       : chevauchement London / New York (12:00 – 16:00 UTC)
 * - Custom        : horaires personnalisés définis dans les paramètres
 * - OutOfSession  : trade hors de toute plage définie ("Hors session")
 */
export type TradingSessionId =
  | "asia"
  | "london"
  | "new_york"
  | "overlap"
  | "custom"
  | "out_of_session";

/**
 * Statistiques de performance pour une session de marché donnée.
 * Calculées sur les trades fermés dont `openedAt` tombe dans la plage UTC.
 */
export interface SessionStats {
  /** Identifiant technique de la session. */
  sessionId: TradingSessionId;
  /** Nom affiché dans l'interface (ex. "London"). */
  sessionName: string;
  /** Devise majoritaire des trades de cette session. */
  currency: string;
  /** Nombre de trades fermés dans cette session. */
  totalTrades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl = 0 (breakeven). */
  breakevenTrades: number;
  /** Somme des net_pnl de tous les trades de la session. */
  netPnlTotal: number;
  /** PnL moyen par trade (netPnlTotal / totalTrades). */
  avgPnl: number;
  /** Pourcentage de trades gagnants (0–100). */
  winRate: number;
  /** PnL moyen des trades gagnants (> 0). Vaut 0 si aucun gain. */
  avgWin: number;
  /** PnL moyen des trades perdants (≤ 0). Vaut 0 si aucune perte. */
  avgLoss: number;
  /** Somme brute des gains (> 0). */
  totalGains: number;
  /** Somme absolue des pertes (> 0). */
  totalLosses: number;
  /**
   * Profit factor = totalGains / totalLosses.
   * null si aucune perte (affiché "∞" dans l'UI).
   */
  profitFactor: number | null;
  /** Meilleur net_pnl observé dans la session. */
  bestTrade: number;
  /** Pire net_pnl observé dans la session. */
  worstTrade: number;
}

/**
 * Méta-statistiques comparatives sur l'ensemble des sessions.
 * Exclut le groupe "Hors session" des classements.
 */
export interface SessionOverviewStats {
  /** Devise dominante sur l'ensemble des trades analysés. */
  currency: string;
  /** Nombre total de trades fermés analysés. */
  totalTrades: number;
  /** Nombre de trades n'appartenant à aucune session définie. */
  outOfSessionTrades: number;
  /** Nom de la session avec le meilleur PnL net total. */
  bestSession: string | null;
  /** PnL net total de la meilleure session. */
  bestSessionPnl: number;
  /** Nom de la session avec le pire PnL net total. */
  worstSession: string | null;
  /** PnL net total de la pire session. */
  worstSessionPnl: number;
  /** Nom de la session la plus active (nombre de trades). */
  mostActiveSession: string | null;
  /** Nombre de trades de la session la plus active. */
  mostActiveCount: number;
  /** Nom de la session avec le meilleur win rate (≥ MIN_TRADES). */
  bestWinRateSession: string | null;
  /** Win rate de la meilleure session (0–100). */
  bestWinRate: number;
}

/**
 * Résultat complet retourné par `getSessionStats()`.
 */
export interface SessionResult {
  overview: SessionOverviewStats | null;
  /** Détail par session — triées par ordre fixe (Asia, London, Overlap, NY, Custom, Hors session). */
  bySessions: SessionStats[];
  isEmpty: boolean;
}

// ============================================================
// ANALYSE PAR ÉMOTION — Phase 7, Étape 11
// ============================================================

/**
 * Colonnes disponibles pour le tri du tableau de performance par émotion.
 */
export type EmotionSortKey =
  | "emotionName"
  | "totalTrades"
  | "netPnl"
  | "avgPnl"
  | "winRate"
  | "avgWin"
  | "avgLoss"
  | "profitFactor"
  | "bestTrade"
  | "worstTrade";

/**
 * Statistiques de performance pour une émotion donnée.
 *
 * GROUPE SPÉCIAL "Sans émotion" :
 *   Les trades sans aucune émotion associée dans `trade_emotions` sont
 *   regroupés sous un ID virtuel (UNASSIGNED_EMOTION_ID = 0).
 *   Ils sont toujours affichés en dernière position dans le tableau.
 *   `isUnassigned` permet à l'UI de les styliser différemment.
 *
 * NOTE MULTI-ASSOCIATION :
 *   Un trade peut avoir plusieurs émotions → il apparaît dans plusieurs groupes.
 *   Le PnL de ce trade est donc compté dans chacun des groupes correspondants.
 *   Cette duplication est intentionnelle : elle reflète l'impact de chaque émotion.
 *
 * FORMULES :
 *   winRate      = winningTrades / totalTrades × 100
 *   avgPnl       = netPnlTotal / totalTrades
 *   avgWin       = Σ(pnl > 0) / winningTrades  (0 si aucun gagnant)
 *   avgLoss      = Σ(pnl < 0) / losingTrades   (≤ 0, 0 si aucun perdant)
 *   profitFactor = totalGains / totalLosses     (null si totalLosses = 0)
 */
export interface EmotionStats {
  /**
   * ID de l'émotion (référence vers `emotions.id`).
   * 0 pour le groupe virtuel "Sans émotion".
   */
  emotionId: number;
  /** Nom de l'émotion (ex. "Peur", "Confiance") ou "Sans émotion". */
  emotionName: string;
  /**
   * true si ce groupe rassemble les trades sans émotion associée.
   * false pour toutes les émotions réelles.
   */
  isUnassigned: boolean;
  /** Devise majoritaire sur ce groupe d'émotions. */
  currency: string;
  /** Nombre de trades fermés associés à cette émotion. */
  totalTrades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Trades avec net_pnl = 0 (breakeven). */
  breakevenTrades: number;

  // ── P&L ─────────────────────────────────────────────────
  /** Somme des net_pnl des trades de ce groupe. */
  netPnlTotal: number;
  /** PnL moyen par trade. */
  avgPnl: number;
  /** Meilleur trade (net_pnl maximal). */
  bestTrade: number;
  /** Pire trade (net_pnl minimal, ≤ 0 ou 0). */
  worstTrade: number;

  // ── Win Rate ─────────────────────────────────────────────
  /** Pourcentage de trades gagnants (0–100). */
  winRate: number;

  // ── Gain / Perte moyens ──────────────────────────────────
  /** Gain moyen des trades gagnants (≥ 0). */
  avgWin: number;
  /** Perte moyenne des trades perdants (≤ 0). */
  avgLoss: number;

  // ── Profit Factor ────────────────────────────────────────
  /** Somme brute des gains. */
  totalGains: number;
  /** Valeur absolue de la somme des pertes. */
  totalLosses: number;
  /**
   * Profit factor = totalGains / totalLosses.
   * null si totalLosses = 0 (affiché "∞" en UI).
   */
  profitFactor: number | null;
}

/**
 * Méta-statistiques comparatives sur l'ensemble des émotions.
 * Le groupe "Sans émotion" est exclu des classements.
 */
export interface EmotionOverviewStats {
  /** Devise majoritaire globale. */
  currency: string;
  /** Nombre d'émotions distinctes ayant au moins un trade fermé. */
  totalEmotions: number;
  /** Nombre de trades sans aucune émotion associée. */
  unassignedTrades: number;
  /** Émotion associée aux meilleurs résultats (PnL net total le plus élevé). */
  bestEmotion: string | null;
  /** PnL net total de la meilleure émotion. */
  bestEmotionPnl: number;
  /** Émotion associée aux pires résultats (PnL net total le plus bas). */
  worstEmotion: string | null;
  /** PnL net total de la pire émotion. */
  worstEmotionPnl: number;
  /** Émotion la plus fréquente (nombre de trades le plus élevé). */
  mostUsedEmotion: string | null;
  /** Nombre de trades de l'émotion la plus fréquente. */
  mostUsedCount: number;
  /**
   * Émotion avec le meilleur win rate (seuil : ≥ MIN_TRADES trades).
   * Exclut le groupe "Sans émotion".
   */
  bestWinRateEmotion: string | null;
  /** Win rate de la meilleure émotion (0–100). */
  bestWinRate: number;
}

/**
 * Résultat complet retourné par `getEmotionStats()`.
 */
export interface EmotionResult {
  /** Méta-statistiques globales pour les cartes de résumé. */
  overview: EmotionOverviewStats | null;
  /**
   * Détail par émotion — trié par PnL décroissant,
   * "Sans émotion" toujours en dernière position.
   */
  byEmotion: EmotionStats[];
  /** true si aucun trade fermé n'existe. */
  isEmpty: boolean;
}

// ============================================================
// HEATMAPS DE PERFORMANCE — Phase 7, Étape 12
// ============================================================

/**
 * Cellule générique de heatmap.
 * Représente un slot temporel (jour de la semaine, heure, mois, date).
 *
 * CONVENTIONS :
 *   - trades = 0  → slot vide ; netPnl = 0, winRate = 0, avgPnl = 0
 *   - winRate = 0 si trades === 0
 *   - avgPnl  = 0 si trades === 0
 *
 * SOURCES DE DATES (définies dans heatmapAnalyticsService.ts) :
 *   byWeekday, byHour : openedAt  (heure/jour de la prise de position)
 *   byMonth,  byDate  : closedAt ?? createdAt (date de résultat)
 */
export interface HeatmapCell {
  /** Identifiant unique du slot (ex. "0" = Lun, "14" = 14h, "2024-01-15"). */
  key: string;
  /** Label d'affichage (ex. "Lun", "14h", "Jan", "15 Jan 2024"). */
  label: string;
  /** Somme des net_pnl des trades du slot. */
  netPnl: number;
  /** Nombre de trades fermés dans ce slot. */
  trades: number;
  /** Trades avec net_pnl > 0. */
  winningTrades: number;
  /** Trades avec net_pnl < 0. */
  losingTrades: number;
  /** Pourcentage de trades gagnants (0–100). Vaut 0 si trades === 0. */
  winRate: number;
  /** net_pnl moyen par trade. Vaut 0 si trades === 0. */
  avgPnl: number;
  /** Devise héritée de la devise globale de la session analytics. */
  currency: string;
}

/**
 * Résultat complet des heatmaps de performance.
 * Retourné par `getHeatmapStats()`.
 */
export interface HeatmapResult {
  /** Devise majoritaire sur l'ensemble des trades analysés. */
  currency: string;
  /**
   * 7 cellules (index 0 = Lundi, …, 6 = Dimanche).
   * Groupement par jour d'ouverture (openedAt UTC).
   * Toujours 7 éléments — les jours sans trade ont trades = 0.
   */
  byWeekday: HeatmapCell[];
  /**
   * 24 cellules (0h → 23h UTC).
   * Groupement par heure d'ouverture (openedAt UTC).
   * Toujours 24 éléments.
   */
  byHour: HeatmapCell[];
  /**
   * 12 cellules (Janvier → Décembre).
   * Groupement par mois de clôture, toutes années confondues.
   * Toujours 12 éléments.
   */
  byMonth: HeatmapCell[];
  /**
   * Un élément par date de clôture ayant au moins un trade.
   * Format de clé : "YYYY-MM-DD".
   * Trié chronologiquement.
   */
  byDate: HeatmapCell[];
  /** true si aucun trade fermé n'existe dans le filtre courant. */
  isEmpty: boolean;
}

// ============================================================
// CALENDRIER DE PERFORMANCE — Phase 7, Etape 14
// ============================================================

/**
 * Trade ferme affiche dans le detail d'une journee du calendrier.
 */
export interface PerformanceCalendarTradeItem {
  id: number;
  externalId: string | null;
  platform: TradePlatform;
  symbol: string;
  side: TradeSide;
  openedAt: string;
  closedAt: string;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  volume: number;
  commission: number;
  swap: number;
  fees: number;
  grossPnl: number | null;
  netPnl: number;
  currency: string;
  riskRewardRatio: number | null;
  strategyId: number | null;
  durationSeconds: number | null;
}

/**
 * Statistiques d'une journee de trading, groupee par date de cloture.
 */
export interface PerformanceCalendarDay {
  /** Date de cloture au format "YYYY-MM-DD". */
  date: string;
  /** Mois de rattachement au format "YYYY-MM". */
  month: string;
  /** Devise majoritaire de l'analyse. */
  currency: string;
  /** Somme des net_pnl des trades fermes ce jour-la. */
  netPnl: number;
  /** Nombre total de trades fermes ce jour-la. */
  trades: number;
  /** Nombre de trades avec net_pnl > 0. */
  winningTrades: number;
  /** Nombre de trades avec net_pnl < 0. */
  losingTrades: number;
  /** Nombre de trades avec net_pnl = 0. */
  breakevenTrades: number;
  /** Pourcentage de trades gagnants sur la journee. */
  winRate: number;
  /** Meilleur net_pnl individuel de la journee. */
  bestTrade: number;
  /** Pire net_pnl individuel de la journee. */
  worstTrade: number;
  /** Trades fermes rattaches a cette journee, tries par heure de cloture. */
  tradeItems: PerformanceCalendarTradeItem[];
}

/**
 * Resume d'un mois pour le calendrier de performance.
 */
export interface PerformanceCalendarMonthSummary {
  /** Mois au format "YYYY-MM". */
  month: string;
  /** Devise majoritaire de l'analyse. */
  currency: string;
  /** Nombre de jours ayant au moins un trade ferme. */
  tradingDays: number;
  /** Somme mensuelle des net_pnl. */
  netPnl: number;
  /** Nombre total de trades fermes dans le mois. */
  trades: number;
  /** Trades gagnants du mois. */
  winningTrades: number;
  /** Trades perdants du mois. */
  losingTrades: number;
  /** Trades neutres du mois. */
  breakevenTrades: number;
  /** Win rate mensuel base sur les trades. */
  winRate: number;
  /** Nombre de jours gagnants. */
  winningDays: number;
  /** Nombre de jours perdants. */
  losingDays: number;
  /** Nombre de jours neutres. */
  neutralDays: number;
  /** Date du meilleur jour du mois. */
  bestDay: string | null;
  /** PnL net du meilleur jour. */
  bestDayPnl: number;
  /** Date du pire jour du mois. */
  worstDay: string | null;
  /** PnL net du pire jour. */
  worstDayPnl: number;
  /** Meilleur trade individuel du mois. */
  bestTrade: number;
  /** Pire trade individuel du mois. */
  worstTrade: number;
}

/**
 * Resultat complet retourne par `getPerformanceCalendarStats()`.
 */
export interface PerformanceCalendarResult {
  /** Devise majoritaire sur les trades inclus. */
  currency: string;
  /** Statistiques quotidiennes, triees chronologiquement. */
  days: PerformanceCalendarDay[];
  /** Resumes mensuels, tries chronologiquement. */
  months: PerformanceCalendarMonthSummary[];
  /** true si aucun trade ferme exploitable n'existe. */
  isEmpty: boolean;
}

// ============================================================
// PERFORMANCE CHART - Phase 8, Etape 4
// ============================================================

export type PerformanceChartPeriod = "day" | "week" | "month";

export interface PerformanceChartPoint {
  period: string;
  netPnl: number;
  cumulativePnl: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
}

export interface PerformanceChartBreakdown {
  byDay: PerformanceChartPoint[];
  byWeek: PerformanceChartPoint[];
  byMonth: PerformanceChartPoint[];
}

export interface PerformanceChartStats {
  totalTrades: number;
  currency: string;
  netPnlTotal: number;
  bestPeriodNetPnl: number;
  worstPeriodNetPnl: number;
}

export interface PerformanceChartResult {
  stats: PerformanceChartStats | null;
  breakdown: PerformanceChartBreakdown | null;
  isEmpty: boolean;
}

// ============================================================
// PROFIT / LOSS DISTRIBUTION - Phase 8, Etape 6
// ============================================================

export type ProfitLossDistributionBucketKind =
  | "loss"
  | "breakeven"
  | "gain";

export interface ProfitLossDistributionBucket {
  bucketId: string;
  kind: ProfitLossDistributionBucketKind;
  /** Libelle compact affiche sur l'axe du graphique. */
  shortLabel: string;
  /** Libelle detaille utilise dans le tooltip. */
  label: string;
  /** Nombre de trades fermes dans cette tranche. */
  tradeCount: number;
  /** PnL moyen des trades de la tranche. Null si tranche vide. */
  avgPnl: number | null;
  /** Somme des net_pnl de la tranche. */
  netPnlTotal: number;
}

export interface ProfitLossDistributionStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  currency: string;
  /** Taille d'une tranche auto-generee autour de 0. */
  bucketSize: number;
  largestGain: number;
  largestLoss: number;
}

export interface ProfitLossDistributionResult {
  stats: ProfitLossDistributionStats | null;
  buckets: ProfitLossDistributionBucket[];
  isEmpty: boolean;
}

// ============================================================
// DETECTION DES HABITUDES - Phase 15
// ============================================================

/**
 * Niveau d'importance d'une observation detectee.
 * Utilise pour trier l'affichage (high > medium > low).
 */
export type HabitImportance = "high" | "medium" | "low";

/**
 * Categorie fonctionnelle d'une habitude detectee.
 * Permet de filtrer/regrouper dans l'UI analytics.
 */
export type HabitObservationCategory =
  | "instrument"
  | "session"
  | "strategy"
  | "emotion"
  | "mistake"
  | "risk_plan"
  | "risk_reward"
  | "timing"
  | "data_quality";

/**
 * Evidence atomique associee a une observation.
 * Ex. "Part des trades sans SL" -> "43.8%".
 */
export interface HabitObservationEvidence {
  label: string;
  value: string;
}

/**
 * Observation descriptive generee a partir des trades fermes.
 *
 * NOTE :
 *   Cette structure est strictement observationnelle.
 *   Elle ne doit pas etre utilisee pour produire des signaux buy/sell
 *   ni des conseils financiers directs.
 */
export interface HabitObservation {
  /** Identifiant stable pour le rendu React et la tracabilite. */
  id: string;
  /** Titre court affiche en liste. */
  title: string;
  /** Resume factuel de l'habitude detectee. */
  summary: string;
  /** Categorie de l'habitude (session, emotion, risque...). */
  category: HabitObservationCategory;
  /** Importance qualitative pour l'ordre de priorite. */
  importance: HabitImportance;
  /** Score numerique interne pour un tri stable. */
  importanceScore: number;
  /** Taille de l'echantillon utilise pour cette observation. */
  sampleSize: number;
  /** Liste d'indices quantifies affichables dans l'UI. */
  evidence: HabitObservationEvidence[];
}

/**
 * Resultat complet retourne par `getHabitDetectionStats()`.
 */
export interface HabitDetectionResult {
  /** Date ISO de generation de l'analyse. */
  generatedAt: string;
  /** Nombre total de trades fermes analyses. */
  totalClosedTrades: number;
  /** Observations triees par importance decroissante. */
  observations: HabitObservation[];
  /** Contraintes de lecture pour eviter toute interpretation abusive. */
  limitations: string[];
  /** true si aucun trade ferme n'est disponible. */
  isEmpty: boolean;
}
