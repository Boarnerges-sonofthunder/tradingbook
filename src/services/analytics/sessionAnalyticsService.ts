// ============================================================
// Service — Analytics par Session de Trading
// ============================================================
// Phase 7 — Étape 10 : Analyse de performance par session de marché.
//
// SESSIONS DÉTECTÉES (basées sur l'heure UTC de `openedAt`) :
//
//   Session          | Heure UTC début | Heure UTC fin
//   -----------------|-----------------|---------------
//   Asia             |  00:00          |  09:00
//   London           |  07:00          |  16:00
//   Overlap (LN/NY)  |  12:00          |  16:00  ← chevauchement prioritaire
//   New York         |  12:00          |  21:00
//   Custom           |  configurable   |  configurable
//   Hors session     |  (aucune correspondance)
//
// PRIORITÉ DE DÉTECTION :
//   Si un trade tombe dans plusieurs sessions (ex. 13:00 UTC = London + NY),
//   la session "Overlap London/New York" est prioritaire sur London et NY.
//   Ensuite, London est prioritaire sur New York.
//
//   Ordre de détection :
//     1. Overlap (12:00–16:00)  ← priorité max
//     2. London  (07:00–16:00)
//     3. New York (12:00–21:00)
//     4. Asia    (00:00–09:00)
//     5. Custom  (si défini, évalué en dernier)
//     6. Hors session (aucune correspondance)
//
// HORAIRES CONFIGURABLES :
//   Les plages sont définies dans SESSION_SCHEDULE (objet constant).
//   Pour les adapter plus tard (settings utilisateur), il suffira de
//   passer un paramètre `scheduleOverride` à `getSessionStats()`.
//
// FLUX DE DONNÉES :
//   AnalyticsPage (React)
//     └── getSessionStats(filters?)
//           └── findTrades({ status: "closed" })
//                 └── SQLite (table trades)
//
// Règle : aucun appel SQLite direct dans ce fichier.
// ============================================================

import { findTradesForAnalytics, type TradeFilters } from "../../repositories";
import { createLogger } from "../logging";
import type { Trade } from "../../types";
import type {
  TradingSessionId,
  SessionStats,
  SessionOverviewStats,
  SessionResult,
} from "../../types/analytics";

const logger = createLogger("analytics.session");

// ============================================================
// Configuration des sessions
// ============================================================

/**
 * Définition d'une plage horaire UTC pour une session de trading.
 * `startHour` est inclus, `endHour` est EXCLU (intervalle [start, end[).
 */
interface SessionSchedule {
  startHour: number; // Heure UTC de début (0–23)
  endHour: number;   // Heure UTC de fin EXCLUE (1–24)
}

/**
 * Noms affichés dans l'interface pour chaque session.
 */
const SESSION_NAMES: Record<TradingSessionId, string> = {
  asia:           "Asia",
  london:         "London",
  overlap:        "Overlap London/NY",
  new_york:       "New York",
  custom:         "Custom",
  out_of_session: "Hors session",
};

/**
 * Plages horaires UTC fixes pour les sessions standard.
 * Modifiable plus tard via un override dans les paramètres utilisateur.
 *
 * Note : le chevauchement London/NY (12:00–16:00) est traité à part
 * dans detectSession() pour avoir la priorité sur London et New York.
 */
const SESSION_SCHEDULE: Record<
  Exclude<TradingSessionId, "out_of_session" | "overlap">,
  SessionSchedule
> = {
  asia:     { startHour: 0,  endHour: 9  },
  london:   { startHour: 7,  endHour: 16 },
  new_york: { startHour: 12, endHour: 21 },
  // Custom : désactivé par défaut, activé si scheduleOverride.custom est fourni
  custom:   { startHour: -1, endHour: -1 },
};

/** Plage du chevauchement London / New York (priorité maximale dans cette plage). */
const OVERLAP_SCHEDULE: SessionSchedule = { startHour: 12, endHour: 16 };

/**
 * Nombre minimum de trades pour qu'une session soit éligible au classement
 * "Meilleur Win Rate" dans l'overview (anti-biais petits échantillons).
 */
const MIN_TRADES_FOR_WINRATE = 5;

/**
 * Ordre d'affichage fixe des sessions dans le tableau de résultats.
 * Le groupe "Hors session" est toujours en dernier.
 */
const SESSION_DISPLAY_ORDER: TradingSessionId[] = [
  "asia",
  "london",
  "overlap",
  "new_york",
  "custom",
  "out_of_session",
];

// ============================================================
// Détection de session
// ============================================================

/**
 * Retourne la session à laquelle appartient un trade, en fonction
 * de l'heure UTC de son ouverture (`openedAt`).
 *
 * PRIORITÉ DE DÉTECTION (de la plus haute à la plus basse) :
 *   1. Overlap London/NY  (12:00–16:00 UTC)
 *   2. London             (07:00–16:00 UTC)
 *   3. New York           (12:00–21:00 UTC)
 *   4. Asia               (00:00–09:00 UTC)
 *   5. Custom             (si horaires définis, -1 = désactivé)
 *   6. Hors session       (aucune correspondance)
 *
 * @param utcHour - Heure UTC (0–23) extraite de openedAt
 * @param schedule - Horaires actifs (peut être surchargé depuis Settings)
 */
function detectSession(
  utcHour: number,
  schedule: typeof SESSION_SCHEDULE,
): TradingSessionId {
  // Priorité 1 : Overlap London/New York (12:00–16:00 UTC)
  if (
    utcHour >= OVERLAP_SCHEDULE.startHour &&
    utcHour < OVERLAP_SCHEDULE.endHour
  ) {
    return "overlap";
  }

  // Priorité 2 : London (07:00–16:00 UTC)
  if (
    utcHour >= schedule.london.startHour &&
    utcHour < schedule.london.endHour
  ) {
    return "london";
  }

  // Priorité 3 : New York (12:00–21:00 UTC)
  // (heures 16:00–21:00, car 12:00–16:00 → Overlap)
  if (
    utcHour >= schedule.new_york.startHour &&
    utcHour < schedule.new_york.endHour
  ) {
    return "new_york";
  }

  // Priorité 4 : Asia (00:00–09:00 UTC)
  if (
    utcHour >= schedule.asia.startHour &&
    utcHour < schedule.asia.endHour
  ) {
    return "asia";
  }

  // Priorité 5 : Custom (si horaires configurés)
  if (
    schedule.custom.startHour >= 0 &&
    utcHour >= schedule.custom.startHour &&
    utcHour < schedule.custom.endHour
  ) {
    return "custom";
  }

  // Pas de session correspondante
  return "out_of_session";
}

// ============================================================
// Accumulateur de données par session
// ============================================================

/**
 * Accumulateur interne — collecte les données brutes d'une session
 * avant calcul des statistiques finales.
 */
interface SessionBucket {
  sessionId: TradingSessionId;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  sumPnl: number;
  sumWins: number;   // Σ pnl > 0
  sumLosses: number; // Σ pnl < 0 (valeur négative)
  bestTrade: number;
  worstTrade: number;
  currencies: Map<string, number>;
}

/** Crée un accumulateur vide pour une session donnée. */
function emptyBucket(sessionId: TradingSessionId): SessionBucket {
  return {
    sessionId,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    sumPnl: 0,
    sumWins: 0,
    sumLosses: 0,
    bestTrade: 0,
    worstTrade: 0,
    currencies: new Map(),
  };
}

/**
 * Retourne le net_pnl d'un trade.
 * Priorité : champ stocké `netPnl` → calcul depuis gross_pnl − frais.
 */
function netPnlOf(t: Trade): number {
  return t.netPnl ?? (t.grossPnl ?? 0) - t.commission - t.swap - t.fees;
}

/** Alimente un accumulateur avec les données d'un trade. */
function feedBucket(bucket: SessionBucket, t: Trade): void {
  const pnl = netPnlOf(t);

  bucket.totalTrades += 1;
  bucket.sumPnl += pnl;
  bucket.currencies.set(
    t.currency,
    (bucket.currencies.get(t.currency) ?? 0) + 1,
  );

  if (pnl > 0) {
    bucket.winningTrades += 1;
    bucket.sumWins += pnl;
  } else if (pnl < 0) {
    bucket.losingTrades += 1;
    bucket.sumLosses += pnl; // reste négatif
  } else {
    bucket.breakevenTrades += 1;
  }

  // Mise à jour des extrêmes au premier trade, puis par comparaison
  if (bucket.totalTrades === 1) {
    bucket.bestTrade = pnl;
    bucket.worstTrade = pnl;
  } else {
    if (pnl > bucket.bestTrade)  bucket.bestTrade  = pnl;
    if (pnl < bucket.worstTrade) bucket.worstTrade = pnl;
  }
}

/** Devise majoritaire parmi une map de fréquences. Retourne "USD" si vide. */
function dominantCurrency(freq: Map<string, number>): string {
  let best = "USD";
  let max = 0;
  for (const [currency, count] of freq.entries()) {
    if (count > max) { max = count; best = currency; }
  }
  return best;
}

// ============================================================
// Conversion accumulateur → SessionStats
// ============================================================

function bucketToStats(b: SessionBucket): SessionStats {
  const currency = dominantCurrency(b.currencies);
  const { totalTrades, winningTrades, losingTrades, breakevenTrades } = b;

  const winRate  = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgPnl   = totalTrades > 0 ? b.sumPnl / totalTrades : 0;
  const avgWin   = winningTrades > 0 ? b.sumWins / winningTrades : 0;
  const avgLoss  = losingTrades  > 0 ? b.sumLosses / losingTrades : 0;

  const totalGains  = b.sumWins;
  const totalLosses = Math.abs(b.sumLosses);

  let profitFactor: number | null;
  if (totalLosses === 0) {
    profitFactor = null; // aucune perte → "∞"
  } else {
    profitFactor = totalGains > 0 ? totalGains / totalLosses : 0;
  }

  return {
    sessionId:      b.sessionId,
    sessionName:    SESSION_NAMES[b.sessionId],
    currency,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    netPnlTotal:    b.sumPnl,
    avgPnl,
    winRate,
    avgWin,
    avgLoss,
    totalGains,
    totalLosses,
    profitFactor,
    bestTrade:  b.bestTrade,
    worstTrade: b.worstTrade,
  };
}

// ============================================================
// Construction de l'overview
// ============================================================

/**
 * Calcule les méta-statistiques comparatives sur l'ensemble des sessions.
 * Le groupe "Hors session" est exclu des classements (best/worst/winRate),
 * mais son nombre de trades est comptabilisé dans `outOfSessionTrades`.
 */
function buildOverview(
  rows: SessionStats[],
  currency: string,
  totalTrades: number,
): SessionOverviewStats {
  let bestSession:       string | null = null;
  let bestSessionPnl    = -Infinity;
  let worstSession:      string | null = null;
  let worstSessionPnl   = Infinity;
  let mostActiveSession: string | null = null;
  let mostActiveCount   = 0;
  let bestWinRateSession: string | null = null;
  let bestWinRate       = -Infinity;
  let outOfSessionTrades = 0;

  for (const s of rows) {
    if (s.sessionId === "out_of_session") {
      outOfSessionTrades = s.totalTrades;
      continue; // exclu des classements
    }
    if (s.totalTrades === 0) continue; // session vide → ignorée

    if (s.netPnlTotal > bestSessionPnl) {
      bestSessionPnl = s.netPnlTotal;
      bestSession    = s.sessionName;
    }
    if (s.netPnlTotal < worstSessionPnl) {
      worstSessionPnl = s.netPnlTotal;
      worstSession    = s.sessionName;
    }
    if (s.totalTrades > mostActiveCount) {
      mostActiveCount   = s.totalTrades;
      mostActiveSession = s.sessionName;
    }
    if (
      s.totalTrades >= MIN_TRADES_FOR_WINRATE &&
      s.winRate > bestWinRate
    ) {
      bestWinRate        = s.winRate;
      bestWinRateSession = s.sessionName;
    }
  }

  return {
    currency,
    totalTrades,
    outOfSessionTrades,
    bestSession,
    bestSessionPnl:    bestSession    !== null ? bestSessionPnl    : 0,
    worstSession,
    worstSessionPnl:   worstSession   !== null ? worstSessionPnl   : 0,
    mostActiveSession,
    mostActiveCount,
    bestWinRateSession,
    bestWinRate:       bestWinRateSession !== null ? bestWinRate    : 0,
  };
}

// ============================================================
// Fonction principale exportée
// ============================================================

/**
 * Calcule les statistiques de performance par session de trading.
 *
 * Seuls les trades `status = "closed"` sont inclus.
 *
 * La session est déterminée à partir de l'heure UTC de `openedAt`
 * (champ ISO 8601, ex. "2024-03-15T08:30:00.000Z").
 *
 * Les trades dont l'heure ne correspond à aucune session connue
 * sont regroupés dans "Hors session" (toujours en dernière position).
 *
 * Résultat trié selon SESSION_DISPLAY_ORDER :
 *   Asia → London → Overlap → New York → Custom → Hors session
 *
 * @param filters - Filtres optionnels (dateRange, broker, etc.)
 */
export async function getSessionStats(
  filters?: TradeFilters,
): Promise<SessionResult> {
  logger.debug("Calcul des statistiques par session", { filters });

  const trades = await findTradesForAnalytics({ ...filters, status: "closed" });

  if (trades.length === 0) {
    logger.debug("Aucun trade fermé — résultat vide");
    return { overview: null, bySessions: [], isEmpty: true };
  }

  // ── Initialisation des accumulateurs ────────────────────
  // Un bucket est créé pour chaque session possible (y compris
  // "out_of_session") afin de garantir l'ordre d'affichage fixe.
  const map = new Map<TradingSessionId, SessionBucket>();
  for (const sessionId of SESSION_DISPLAY_ORDER) {
    map.set(sessionId, emptyBucket(sessionId));
  }

  // ── Groupement en un seul passage O(n) ──────────────────
  for (const t of trades) {
    // Extraction de l'heure UTC depuis la chaîne ISO 8601
    // Exemple : "2024-03-15T08:30:00.000Z" → 8
    const date = new Date(t.openedAt);
    const utcHour = date.getUTCHours();

    const sessionId = detectSession(utcHour, SESSION_SCHEDULE);
    feedBucket(map.get(sessionId)!, t);
  }

  // ── Conversion accumulateurs → SessionStats ─────────────
  // Les sessions sans trades sont incluses dans le résultat (totalTrades = 0)
  // pour que le tableau affiche toujours les mêmes lignes.
  const bySessions: SessionStats[] = SESSION_DISPLAY_ORDER.map((id) =>
    bucketToStats(map.get(id)!),
  );

  // ── Devise globale ────────────────────────────────────────
  const globalCurrencies = new Map<string, number>();
  for (const t of trades) {
    globalCurrencies.set(
      t.currency,
      (globalCurrencies.get(t.currency) ?? 0) + 1,
    );
  }
  const globalCurrency = dominantCurrency(globalCurrencies);

  const overview = buildOverview(bySessions, globalCurrency, trades.length);

  logger.debug("Statistiques par session calculées", {
    sessions: bySessions.filter((s) => s.totalTrades > 0).length,
    outOfSession: overview.outOfSessionTrades,
    best: overview.bestSession,
  });

  return { overview, bySessions, isEmpty: false };
}
