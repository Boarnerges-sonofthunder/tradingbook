// ============================================================
// Types — MetaTrader 4 (préparation architecture)
// ============================================================
// Phase 6 Étape 2.1 — Architecture MT4 (lecture seule, aucun import actif)
//
// RÈGLE ABSOLUE : TradingBook ne place JAMAIS d'ordre via MT4.
//                Tous les types ici sont en lecture seule.
//
// TERMINOLOGIE MT4 :
//   Order    — unité de base dans MT4 (≠ MT5).
//              Un order = une position complète (entrée + sortie).
//              MT4 n'a PAS de concept "deal" ou "positionId" comme MT5.
//   Ticket   — identifiant unique de l'order dans MT4.
//   Balance  — entrée de dépôt/retrait dans l'historique (type 6).
//
// DIFFÉRENCES FONDAMENTALES MT4 vs MT5 :
//   MT5 : deal (atomique) + positionId (regroupe plusieurs deals)
//   MT4 : order (complet) — 1 order = 1 trade clôturé
//
//   MT5 : Python API officielle (MetaTrader5 pip)
//   MT4 : pas d'API Python → export via MQL4 EA/Script local
//
//   MT5 : bridge Python actif (lecture en temps réel)
//   MT4 : bridge fichier passif (lecture d'un export JSON/CSV)
//
// FLUX D'IMPORT MT4 (futur) :
//   MT4 Terminal
//     → MQL4 EA/Script (s'exécute dans le terminal)
//     → Écrit data/imports/mt4_export.json (ou .csv)
//     → mt4BridgeService  — détecte et lit le fichier
//     → mt4MappingService — MT4RawOrder → CreateTradeInput
//     → mt4DeduplicationService — évite les doublons (par ticket)
//     → tradesService     — insère dans SQLite
//
// ÉTAT D'IMPLÉMENTATION :
//   ✅ Types définis (cette étape)
//   🔲 mt4BridgeService   — Phase 6 Étape future
//   🔲 mt4MappingService  — Phase 6 Étape future
//   🔲 mt4ImportService   — Phase 6 Étape future
//   🔲 Migration SQLite 005 — à appliquer avant usage réel
// ============================================================

// ─── Type d'opération MT4 ──────────────────────────────────

/**
 * Type d'opération MT4 sous forme lisible.
 *
 * Correspondance avec les constantes MQL4 (OP_*) :
 *   "buy"        → OP_BUY       (0) — achat au marché
 *   "sell"       → OP_SELL      (1) — vente au marché
 *   "buy_limit"  → OP_BUYLIMIT  (2) — ordre limité achat
 *   "sell_limit" → OP_SELLLIMIT (3) — ordre limité vente
 *   "buy_stop"   → OP_BUYSTOP   (4) — ordre stop achat
 *   "sell_stop"  → OP_SELLSTOP  (5) — ordre stop vente
 *   "balance"    → OP_BALANCE   (6) — dépôt/retrait/correction
 *   "credit"     → OP_CREDIT    (7) — crédit (rare)
 *
 * Seuls "buy" et "sell" sont des trades normaux à importer.
 * Les types "balance" et "credit" sont filtrés lors du mapping.
 */
export type MT4OrderType =
  | "buy"
  | "sell"
  | "buy_limit"
  | "sell_limit"
  | "buy_stop"
  | "sell_stop"
  | "balance"
  | "credit";

// ─── Données brutes d'un order MT4 ────────────────────────

/**
 * Order brut tel qu'exporté par un MQL4 EA ou Script.
 *
 * Ces données reflètent EXACTEMENT ce que MT4 stocke dans son historique.
 * Aucun champ n'est calculé ou transformé ici.
 * La normalisation vers un Trade TradingBook se fait dans mt4MappingService.ts.
 *
 * IMPORTANT :
 *   - `stopLoss` et `takeProfit` valent 0.0 si non définis (convention MT4).
 *   - `closeTime` est null uniquement si l'order est encore ouvert.
 *   - `profit` est brut (avant commission et swap dans certains exports).
 *   - `magicNumber` = 0 si l'order a été passé manuellement.
 */
export interface MT4RawOrder {
  /** Numéro de ticket MT4 — identifiant unique de cet order. */
  ticket: number;

  /** Heure d'ouverture de la position (ISO 8601 UTC). */
  openTime: string;

  /** Type d'opération sous forme lisible (ex: "buy", "sell", "balance"). */
  type: MT4OrderType;

  /** Type d'opération sous forme entière (constante MQL4 OP_*). */
  typeRaw: number;

  /** Volume en lots (ex: 0.01, 0.1, 1.0). */
  size: number;

  /**
   * Symbole de l'instrument financier (ex: "EURUSD", "XAUUSD").
   * Vide ("") pour les entrées de type "balance" ou "credit".
   */
  symbol: string;

  /** Prix d'ouverture de la position. */
  openPrice: number;

  /** Stop loss (0.0 si non défini — convention MT4). */
  stopLoss: number;

  /** Take profit (0.0 si non défini — convention MT4). */
  takeProfit: number;

  /**
   * Heure de clôture de la position (ISO 8601 UTC).
   * null uniquement si la position est encore ouverte au moment de l'export.
   */
  closeTime: string | null;

  /** Prix de clôture de la position. null si la position est encore ouverte. */
  closePrice: number | null;

  /**
   * Commission courtier en devise du compte.
   * Convention : valeur négative = coût (ex: -2.50).
   * Certains brokers incluent la commission dans le profit — vérifier le profil.
   */
  commission: number;

  /**
   * Swap (frais de rollover overnight) en devise du compte.
   * Convention : valeur négative = coût.
   */
  swap: number;

  /**
   * Profit brut de la position en devise du compte.
   * Pour "balance"/"credit" : montant du dépôt ou retrait.
   */
  profit: number;

  /** Commentaire attaché à l'order (libre, souvent utilisé par les EAs). */
  comment: string;

  /**
   * Numéro magique attribué par l'EA créateur de l'order.
   * 0 = order passé manuellement.
   */
  magicNumber: number;
}

// ─── Format du fichier d'export MT4 ───────────────────────

/**
 * Format du fichier JSON produit par le MQL4 EA d'export.
 *
 * Le MQL4 EA (à créer) écrira ce fichier dans data/imports/ ou
 * dans le dossier Files/ du terminal MT4 (chemin configurable).
 *
 * Structure cible du fichier :
 *   {
 *     "version": "1.0",
 *     "exportedAt": "2026-05-18T10:00:00Z",
 *     "account": 12345678,
 *     "accountName": "John Doe",
 *     "server": "BrokerName-Live",
 *     "broker": "Broker Company",
 *     "currency": "USD",
 *     "leverage": "1:100",
 *     "orders": [...]
 *   }
 */
export interface MT4ExportFile {
  /** Version du format d'export (pour la compatibilité future). */
  version: "1.0";

  /** Horodatage de l'export (ISO 8601 UTC). */
  exportedAt: string;

  /** Numéro de compte MT4. */
  account: number;

  /** Nom du titulaire du compte. */
  accountName: string;

  /** Nom du serveur broker (ex: "FusionMarkets-Live"). */
  server: string;

  /** Nom de la société broker (ex: "Fusion Markets Pty Ltd"). */
  broker: string;

  /** Devise du compte (ex: "USD", "EUR", "CAD"). */
  currency: string;

  /** Levier du compte (ex: "1:100", "1:500"). */
  leverage: string;

  /** Liste des orders exportés (inclut balance et trades). */
  orders: MT4RawOrder[];
}

// ─── Résultat de la lecture du fichier d'export ───────────

/**
 * Résultat retourné par `mt4BridgeService.readMT4ExportFile()`.
 *
 * Encapsule soit les données lues avec succès,
 * soit une erreur structurée si la lecture a échoué.
 */
export interface MT4ReadResult {
  /** true si le fichier a été lu et parsé avec succès. */
  success: boolean;

  /** Données du fichier (présent si success = true). */
  data?: MT4ExportFile;

  /** Code d'erreur machine-readable (présent si success = false). */
  errorCode?: MT4ReadErrorCode;

  /** Message descriptif de l'état ou de l'erreur. */
  message: string;
}

// ─── Codes d'erreur de la lecture fichier MT4 ─────────────

/**
 * Codes d'erreur retournés par mt4BridgeService.
 *
 * FILE_NOT_FOUND    — aucun fichier d'export MT4 détecté dans les chemins connus
 * FILE_UNREADABLE   — fichier trouvé mais impossible à lire (droits, verrou)
 * PARSE_ERROR       — le fichier n'est pas du JSON valide
 * FORMAT_ERROR      — JSON valide mais structure inattendue (mauvaise version)
 * NO_ORDERS         — fichier valide mais aucun order dans la liste
 * UNKNOWN_ERROR     — erreur non catégorisée
 */
export type MT4ReadErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_UNREADABLE"
  | "PARSE_ERROR"
  | "FORMAT_ERROR"
  | "NO_ORDERS"
  | "UNKNOWN_ERROR";

// ─── Résultat du mapping MT4 → Trade ──────────────────────

/**
 * Résumé du mapping d'un fichier MT4 vers des trades TradingBook.
 *
 * Retourné par `mt4MappingService.mapMT4Orders()`.
 */
export interface MT4MappingResult {
  /** Nombre d'orders dans l'export d'origine. */
  totalOrders: number;

  /** Nombre d'orders ignorés (balance, credit, ordres non fermés). */
  skippedOrders: number;

  /** Nombre de trades produits (orders buy/sell fermés uniquement). */
  mappedTrades: number;

  /** Raisons des orders ignorés (pour audit). */
  skippedReasons: MT4SkippedOrder[];
}

/**
 * Détail d'un order ignoré lors du mapping.
 */
export interface MT4SkippedOrder {
  /** Ticket de l'order ignoré. */
  ticket: number;

  /** Raison de l'exclusion. */
  reason:
    | "balance_entry"   // type = "balance" ou "credit"
    | "still_open"      // closeTime est null
    | "invalid_symbol"  // symbol vide ou invalide
    | "zero_size"       // size = 0
    | "unsupported_type"; // type non géré
}

// ─── État UI de l'import MT4 ──────────────────────────────

/**
 * États possibles de l'interface d'import MT4.
 *
 * idle         — aucune action en cours
 * detecting    — recherche du fichier d'export dans les chemins connus
 * reading      — lecture et parsing du fichier
 * mapping      — conversion MT4RawOrder → CreateTradeInput
 * previewing   — données prêtes, en attente de confirmation utilisateur
 * importing    — écriture dans SQLite en cours
 * success      — import terminé avec succès
 * error        — erreur à l'une des étapes ci-dessus
 */
export type MT4ImportStatus =
  | "idle"
  | "detecting"
  | "reading"
  | "mapping"
  | "previewing"
  | "importing"
  | "success"
  | "error";
