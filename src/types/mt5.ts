import type { MT5ErrorCode } from "./mt5Errors";

// ============================================================
// Types — MetaTrader 5 Bridge
// ============================================================
// Phase 6 Étapes 2 & 3 — Bridge de connexion MT5 + Historique
//
// RÈGLE : TradingBook ne place JAMAIS d'ordre via MT5.
//         Tous les types ici sont en lecture seule.
//
// TERMINOLOGIE MT5 :
//   Deal     — transaction exécutée (unité atomique). Ce bridge lit des deals.
//   Order    — ordre passé (peut donner lieu à plusieurs deals).
//   Position — trade ouvert (peut regrouper plusieurs deals entrée/sortie).
//
// Ces types reflètent les données BRUTES retournées par le bridge Python.
// Le mapping vers les trades TradingBook est fait dans mt5MappingService.ts
// (Phase 6 Étape 4 — pas encore implémenté).
// ============================================================

// ─── Codes d'erreur du bridge Python ──────────────────────

/**
 * Codes d'erreur retournés par mt5_bridge.py.
 *
 * MT5_LIB_MISSING    — bibliothèque Python MetaTrader5 non installée
 * MT5_NOT_RUNNING    — terminal MT5 fermé ou ne répond pas
 * MT5_NOT_CONNECTED  — MT5 ouvert mais hors ligne (pas de connexion broker)
 * MT5_NO_DATA        — aucun deal sur la période demandée
 * MT5_UNKNOWN_ERROR  — erreur non catégorisée retournée par MT5
 * INVALID_PERIOD     — plage de dates invalide ou malformée
 * PYTHON_NOT_FOUND   — Python introuvable dans le PATH système
 * PYTHON3_NOT_FOUND  — python3 introuvable (fallback Windows)
 * SCRIPT_ERROR       — exception Python non récupérée dans le bridge
 * TIMEOUT            — le script n'a pas répondu dans les délais
 * PARSE_ERROR        — la sortie du script n'est pas du JSON valide
 */
export type MT5LegacyErrorCode =
  | "MT5_LIB_MISSING"
  | "MT5_NOT_RUNNING"
  | "MT5_NOT_CONNECTED"
  | "MT5_NO_DATA"
  | "MT5_UNKNOWN_ERROR"
  | "INVALID_PERIOD"
  | "PYTHON_NOT_FOUND"
  | "PYTHON3_NOT_FOUND"
  | "SCRIPT_ERROR"
  | "TIMEOUT"
  | "PARSE_ERROR";

export type MT5CheckErrorCode = MT5ErrorCode | MT5LegacyErrorCode;

// ─── Résultat de la vérification de connexion ─────────────

/**
 * Résultat retourné par le script `mt5_bridge.py --mode check`.
 *
 * Mappé directement depuis le JSON stdout du bridge Python.
 * Tous les champs optionnels sont absents en cas d'erreur.
 */
export interface MT5BridgeCheckResult {
  /** true si MT5 est accessible et le bridge a fonctionné. */
  success: boolean;

  /** true si le terminal est connecté au serveur broker. */
  terminalConnected: boolean;

  // ---- Compte actif (présent si terminalConnected = true) ------

  /** Numéro de compte MT5 (ex: 12345678). */
  account?: number;

  /** Nom du titulaire du compte. */
  accountName?: string;

  /** Nom du serveur broker (ex: "FusionMarkets-Live"). */
  server?: string;

  /** Nom de la société broker (ex: "Fusion Markets"). */
  company?: string;

  /** Devise du compte (ex: "USD", "EUR"). */
  currency?: string;

  // ---- Terminal (présent si MT5 détecté) -----------------------

  /** Version build du terminal MT5 (ex: "MetaTrader 5 build 4000"). */
  terminalVersion?: string;

  /** Chemin d'installation du terminal MT5 sur Windows. */
  terminalPath?: string;

  // ---- Erreur (présent si success = false) ---------------------

  /** Code d'erreur machine-readable. */
  errorCode?: MT5CheckErrorCode;

  /** Message descriptif de l'état ou de l'erreur. */
  message: string;
}

// ─── État de la vérification dans l'UI ────────────────────

/**
 * États possibles du processus de vérification MT5 dans l'UI.
 *
 * idle      — aucune vérification lancée
 * checking  — vérification en cours (spinner)
 * connected — MT5 détecté et connecté au broker
 * partial   — MT5 détecté mais pas connecté au broker (hors ligne)
 * error     — erreur (Python manquant, MT5 fermé, etc.)
 */
export type MT5CheckStatus =
  | "idle"
  | "checking"
  | "connected"
  | "partial"
  | "error";

// ─── Instructions d'installation contextuelle ─────────────

/**
 * Action recommandée à afficher à l'utilisateur selon le code d'erreur.
 */
export interface MT5CheckAction {
  /** Titre de l'action recommandée. */
  title: string;
  /** Description de l'étape. */
  description: string;
  /** Commande ou URL à afficher si applicable. */
  command?: string;
}

// ─── Périodes prédéfinies pour l'historique ───────────────

/**
 * Périodes prédéfinies acceptées par le bridge Python --mode history.
 * "custom" est géré côté TypeScript uniquement (--from / --to).
 */
export type MT5HistoryPeriod = "today" | "7d" | "30d" | "custom";

// ─── Deal brut MT5 (données brutes du bridge) ─────────────

/**
 * Un deal tel que retourné par le bridge Python mt5_bridge.py.
 *
 * IMPORTANT : Ces données sont BRUTES — elles reflètent exactement ce que
 * MT5 fournit. Elles ne sont PAS encore mappées vers les trades TradingBook.
 *
 * Un trade TradingBook = une position MT5 = N deals (entrée + sortie(s)).
 * Le mapping est fait dans mt5MappingService.ts (Phase 6 Étape 4).
 *
 * TYPES DE DEALS :
 *   "buy" / "sell"       — transactions de marché (les seules qui comptent comme trades)
 *   "balance"            — dépôts/retraits (ignorés lors du mapping)
 *   "commission_*"       — frais de commission (pris en compte dans le calcul P&L)
 *   "swap"               — swap overnight (pris en compte dans le calcul P&L)
 *   etc.
 *
 * ENTRÉE / SORTIE :
 *   entry = "in"    — ouverture de position (prix d'entrée)
 *   entry = "out"   — clôture de position (prix de sortie)
 *   entry = "inout" — retournement (sortie + nouvelle entrée)
 */
export interface MT5RawDeal {
  /** Identifiant unique du deal (DEAL_TICKET). */
  ticket: number;

  /** Identifiant de l'ordre qui a généré ce deal (DEAL_ORDER). */
  orderId: number;

  /** Identifiant de la position parente (DEAL_POSITION_ID). */
  positionId: number;

  /** Symbole de l'instrument (ex: "XAUUSD", "EURUSD"). */
  symbol: string;

  /**
   * Type de deal lisible : "buy", "sell", "balance", "commission", etc.
   * Voir la table _DEAL_TYPE_NAMES dans mt5_bridge.py.
   */
  type: string;

  /** Valeur entière brute du DEAL_TYPE MT5 (pour débogage). */
  typeRaw: number;

  /**
   * Sens du deal par rapport à la position :
   *   "in"    — entrée dans le marché
   *   "out"   — sortie du marché
   *   "inout" — retournement de position
   *   "out_by"— clôture par position opposée
   */
  entry: string;

  /** Valeur entière brute du DEAL_ENTRY MT5 (pour débogage). */
  entryRaw: number;

  /** Volume en lots (ex: 0.10). */
  volume: number;

  /** Prix d'exécution du deal. */
  price: number;

  /** Commission du broker (généralement négatif, ex: -0.70). */
  commission: number;

  /** Swap overnight cumulé sur le deal. */
  swap: number;

  /** Profit/perte brut du deal (en devise du compte). */
  profit: number;

  /** Frais supplémentaires (DEAL_FEE, souvent 0). */
  fee: number;

  /** Stop Loss au moment du deal (0 si non défini). */
  sl: number;

  /** Take Profit au moment du deal (0 si non défini). */
  tp: number;

  /** Numéro magique de l'EA (0 si trade manuel). */
  magic: number;

  /** Commentaire MT5 associé au deal. */
  comment: string;

  /** Date/heure d'exécution en ISO 8601 UTC (ex: "2026-01-15T14:32:00+00:00"). */
  time: string;
}

// ─── Plage de dates retournée par le bridge ───────────────

/**
 * Plage de dates effective de la requête historique.
 * Les deux valeurs sont en ISO 8601 UTC.
 */
export interface MT5HistoryRange {
  from: string;
  to: string;
}

// ─── Résultat complet de la requête historique ────────────

/**
 * Résultat retourné par mt5_bridge.py --mode history.
 *
 * En cas de succès, `deals` contient tous les deals sur la période.
 * En cas d'échec, `success` = false et `errorCode` est défini.
 *
 * NOTE : Ce résultat est prévu pour la PRÉVISUALISATION uniquement.
 * L'import dans SQLite est réalisé à l'Étape 4 (pas encore implémenté).
 */
export interface MT5HistoryResult {
  /** true si la lecture s'est bien passée. */
  success: boolean;

  /** Plage de dates effective de la requête. */
  range?: MT5HistoryRange;

  /** Liste des deals bruts retournés par MT5. */
  deals: MT5RawDeal[];

  /** Nombre total de deals dans le résultat. */
  totalDeals: number;

  // ---- Infos du compte (présent si connecté) -------------------

  /** Numéro de compte MT5. */
  account?: number;

  /** Identifiant string du compte. */
  accountId?: string;

  /** Serveur broker. */
  server?: string;

  /** Nom du broker. */
  broker?: string;

  /** Devise du compte. */
  currency?: string;

  // ---- Erreur (présent si success = false) ---------------------

  /** Code d'erreur machine-readable. */
  errorCode?: MT5CheckErrorCode;

  /** Message descriptif du résultat ou de l'erreur. */
  message: string;
}

// ─── Candles OHLC brutes MT5 (replay chart) ───────────────

/**
 * Une chandelle OHLC brute retournée par mt5_bridge.py --mode candles.
 * Données lecture seule utilisées pour analytics/replay uniquement.
 */
export interface MT5RawCandle {
  /** Horodatage ISO 8601 UTC de la bougie. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Résultat de lecture des chandelles OHLC MT5.
 * Ne déclenche jamais de trading, import purement analytique.
 */
export interface MT5CandlesResult {
  success: boolean;
  symbol?: string;
  timeframe?: string;
  range?: MT5HistoryRange;
  candles: MT5RawCandle[];
  totalCandles: number;
  account?: number;
  accountId?: string;
  server?: string;
  broker?: string;
  currency?: string;
  errorCode?: MT5CheckErrorCode;
  message: string;
}

// ─── État de la requête historique dans l'UI ──────────────

/**
 * États possibles du chargement de l'historique dans l'UI.
 *
 * idle     — aucune requête lancée
 * loading  — requête en cours
 * success  — données disponibles
 * empty    — succès mais aucun deal sur la période
 * error    — erreur du bridge ou de parsing
 */
export type MT5HistoryStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error";

// ─── Position ouverte brute MT5 ───────────────────────────

/**
 * Une position ouverte telle que retournée par mt5_bridge.py --mode positions.
 *
 * IMPORTANT : Ces données sont BRUTES — elles reflètent ce que MT5 fournit
 * via `positions_get()`. Elles ne sont PAS encore mappées vers des trades
 * TradingBook (mapping = Phase 6 Étape 5).
 *
 * DIFFÉRENCE DEAL vs POSITION :
 *   Deal     — transaction passée (historique, clôturée)
 *   Position — trade actuellement ouvert (P&L non réalisé, prix en temps réel)
 *
 * NOTE COMMISSION :
 *   `commission` dans positions_get() représente uniquement la commission
 *   d'ouverture. La commission de clôture sera ajoutée lors de la fermeture.
 *   Certains brokers ne l'exposent pas ici (valeur = 0).
 */
export interface MT5RawPosition {
  /** Ticket de la position (POSITION_TICKET) — identifiant unique. */
  ticket: number;

  /** Identifiant de position (POSITION_IDENTIFIER) — généralement = ticket. */
  positionId: number;

  /** Symbole de l'instrument (ex: "XAUUSD", "EURUSD"). */
  symbol: string;

  /** Type lisible : "buy" ou "sell". */
  type: "buy" | "sell";

  /** Valeur entière brute du POSITION_TYPE (0=buy, 1=sell). */
  typeRaw: number;

  /** Volume en lots (ex: 0.10). */
  volume: number;

  /** Prix d'ouverture de la position. */
  openPrice: number;

  /** Prix actuel du marché (mis à jour à chaque appel). */
  currentPrice: number;

  /** Stop Loss (0.0 si non défini — convention MT5). */
  stopLoss: number;

  /** Take Profit (0.0 si non défini — convention MT5). */
  takeProfit: number;

  /** P&L non réalisé en devise du compte (POSITION_PROFIT). */
  profit: number;

  /** Swap cumulé depuis l'ouverture (POSITION_SWAP). */
  swap: number;

  /**
   * Commission d'ouverture (POSITION_COMMISSION).
   * Souvent 0 — varie selon le broker et le type de compte.
   */
  commission: number;

  /** Date/heure d'ouverture en ISO 8601 UTC. */
  openTime: string;

  /** Commentaire MT5 attaché à la position. */
  comment: string;

  /** Numéro magique de l'EA créateur (0 = trade manuel). */
  magic: number;
}

// ─── Résultat complet de la requête positions ─────────────

/**
 * Résultat retourné par mt5_bridge.py --mode positions.
 *
 * En cas de succès et de positions ouvertes, `positions` est non vide.
 * `success: true` avec `totalPositions: 0` = compte sans position ouverte.
 */
export interface MT5PositionsResult {
  /** true si la lecture s'est bien passée. */
  success: boolean;

  /** Liste des positions ouvertes. Vide si aucune position ou erreur. */
  positions: MT5RawPosition[];

  /** Nombre de positions ouvertes. */
  totalPositions: number;

  // ---- Infos du compte (présent si connecté) -------------------

  /** Numéro de compte MT5. */
  account?: number;

  /** Identifiant string du compte. */
  accountId?: string;

  /** Serveur broker. */
  server?: string;

  /** Nom du broker. */
  broker?: string;

  /** Devise du compte. */
  currency?: string;

  // ---- Erreur (présent si success = false) ---------------------

  /** Code d'erreur machine-readable. */
  errorCode?: MT5CheckErrorCode;

  /** Message descriptif du résultat ou de l'erreur. */
  message: string;
}

// ─── État UI des positions ouvertes ───────────────────────

/**
 * États possibles du chargement des positions dans l'UI.
 *
 * idle     — aucune requête lancée
 * loading  — requête en cours
 * success  — positions disponibles (totalPositions > 0)
 * empty    — succès mais aucune position ouverte sur le compte
 * error    — erreur du bridge ou de parsing
 */
export type MT5PositionsStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "error";

// ─── Synchronisation MT5 ─────────────────────────────────

/**
 * Rapport de résultat retourné par mt5SyncService.runMT5Sync().
 *
 * Contient toutes les statistiques de la synchronisation :
 * combien de deals/positions lus, combien insérés, mis à jour,
 * ignorés (doublons) et en erreur.
 *
 * LECTURE SEULE côté MT5 : aucun ordre n'est passé via ce rapport.
 */
export interface MT5SyncReport {
  /** true si la synchronisation s'est terminée sans erreur critique. */
  success: boolean;

  /** Période de l'historique demandée. */
  period: MT5HistoryPeriod;

  // ── Statistiques de lecture MT5 ──────────────────────────

  /** Nombre de deals bruts lus depuis MT5 (historique). */
  dealsRead: number;

  /** Nombre de positions ouvertes lues depuis MT5. */
  positionsRead: number;

  /** Nombre total de candidats après mapping deals → trades. */
  candidatesFromHistory: number;

  /** Nombre total de candidats depuis les positions ouvertes. */
  candidatesFromPositions: number;

  // ── Statistiques de détection MT5 ───────────────────────

  /** Candidats classés comme nouveaux avant insertion SQLite. */
  detectedNew: number;

  /** Candidats déjà présents en base et ignorés. */
  detectedExisting: number;

  /** Candidats existants ouverts avec au moins un champ MT5 à mettre à jour. */
  detectedUpdates: number;

  /** Candidats ressemblants à un trade local, non importés automatiquement. */
  detectedProbableDuplicates: number;

  /** Candidats rejetés avant écriture pour données MT5 invalides. */
  detectedInvalid: number;

  // ── Statistiques d'écriture SQLite ───────────────────────

  /** Nombre de nouveaux trades insérés dans SQLite. */
  inserted: number;

  /**
   * Nombre de trades existants mis à jour.
   * Ex: position ouverte dont le swap ou le P&L a changé.
   * Ex: position fermée entre deux syncs (status open → closed).
   */
  updated: number;

  /**
   * Nombre de trades ignorés car déjà présents et inchangés.
   * (doublon exact par externalId)
   */
  skipped: number;

  /** Nombre d'erreurs individuelles pendant l'insertion/mise à jour. */
  errors: number;

  /** Messages d'erreur individuels (limité à 20 pour éviter une UI surchargée). */
  errorMessages: string[];

  /** Alertes de détection (doublons probables, invalides), limitées à 20. */
  detectionMessages: string[];

  // ── Infos du compte MT5 ──────────────────────────────────

  account?: number;
  accountId?: string;
  server?: string;
  broker?: string;
  currency?: string;

  // ── Résumé ───────────────────────────────────────────────

  /** Message descriptif global. */
  message: string;

  /** Horodatage ISO 8601 de fin de synchronisation. */
  syncedAt: string;

  /** ID du log créé dans la table `mt5_sync_logs`. */
  logId?: number;
}

/**
 * États de la synchronisation MT5 dans l'UI de MT5SyncPage.
 *
 * idle    — aucune synchronisation lancée
 * syncing — synchronisation en cours (spinner)
 * success — terminé avec succès (0 ou N insertions)
 * partial — terminé avec des erreurs partielles
 * error   — erreur critique (MT5 injoignable, Python manquant, etc.)
 */
export type MT5SyncStatus = "idle" | "syncing" | "success" | "partial" | "error";

/**
 * Intervalle de synchronisation automatique MT5.
 *
 * "disabled" — refresh automatique désactivé (opt-in requis).
 * "30s"      — toutes les 30 secondes (usage debug uniquement).
 * "1min"     — toutes les minutes.
 * "5min"     — toutes les 5 minutes (valeur par défaut).
 * "15min"    — toutes les 15 minutes.
 */
export type MT5AutoRefreshInterval = "disabled" | "30s" | "1min" | "5min" | "15min";
