// ============================================================
// Broker CSV Profiles — TradingBook
// ============================================================
// Définit les signatures et les mappings des formats CSV connus.
//
// Chaque profil contient :
//   - signatureHeaders : colonnes normalisées caractéristiques du format,
//     utilisées pour calculer le score de correspondance.
//   - fieldAliases : correspondance header normalisé → champ interne,
//     plus précise que l'ALIAS_MAP générique de csvMappingService.
//
// Comment ajouter un nouveau profil broker :
//   1. Obtenir un export réel du broker.
//   2. Normaliser les noms de colonnes via normalizeHeader().
//   3. Identifier les colonnes qui distinguent ce format des autres
//      (signatureHeaders). Préférer des headers spécifiques et nombreux.
//   4. Définir fieldAliases pour tous les champs importables.
//   5. Ajouter le profil dans BROKER_PROFILES.
//   6. Ajouter la clé dans BrokerFormat (types/csvImport.ts).
//   7. Valider avec `npx tsc --noEmit`.
//
// Formats couverts :
//   - MetaTrader 5 (statement HTML)
//   - MetaTrader 4 (statement HTML)
//   - Fusion Markets (export CSV basé sur MT5)
//
// Note : les headers de signature sont tous normalisés (minuscules,
// sans accents, espaces normalisés) — voir normalizeHeader().
// ============================================================

import type { TradeField } from "../../types/csvImport";

// ─── Interface de profil ────────────────────────────────────

/**
 * Profil d'un format CSV broker connu.
 *
 * Chaque profil permet deux choses :
 *   1. Détecter si un CSV provient de ce broker (via signatureHeaders + scoring).
 *   2. Appliquer un mapping précis adapté au format (via fieldAliases).
 */
export interface BrokerProfile {
  /** Identifiant technique unique du profil. */
  id: "mt5" | "mt4" | "fusion_markets";

  /** Nom lisible affiché à l'utilisateur (ex: "MetaTrader 5"). */
  name: string;

  /** Description courte du format (affiché dans l'interface). */
  description: string;

  /**
   * En-têtes normalisés caractéristiques de ce format.
   *
   * Ces colonnes sont comparées aux headers normalisés du CSV importé.
   * Le ratio (colonnes trouvées / total signature) donne le score de confiance.
   *
   * Conseil : inclure les colonnes les plus spécifiques en premier.
   * Éviter des colonnes génériques comme "symbol" ou "type" si elles
   * sont communes à tous les formats.
   */
  signatureHeaders: string[];

  /**
   * Mapping spécifique au format : header normalisé → champ interne.
   *
   * Couvre tous les champs importables de ce broker, y compris les
   * variantes non couvertes par l'ALIAS_MAP générique (ex: "s / l" MT5).
   *
   * Clé   = normalizeHeader(colonne telle qu'elle apparaît dans le CSV)
   * Valeur = clé interne TradingBook (TradeField)
   */
  fieldAliases: Record<string, TradeField>;

  /**
   * Score minimum (0..1) pour une confiance "high".
   * Recommandation : 0.75 (au moins 3/4 des colonnes de signature trouvées).
   */
  minScoreHigh: number;

  /**
   * Score minimum (0..1) pour une confiance "medium".
   * En dessous → "low". En dessous de 0.30 → format non reconnu.
   */
  minScoreMedium: number;
}

// ─── Profils connus ─────────────────────────────────────────

/**
 * Catalogue des profils broker connus, par ordre de priorité de détection.
 *
 * Si deux profils ont le même score, le premier dans cette liste gagne.
 * Placer les profils les plus spécifiques (Fusion Markets) avant les
 * profils génériques (MT5 standard) pour éviter les faux positifs.
 */
export const BROKER_PROFILES: BrokerProfile[] = [
  // ── Fusion Markets ──────────────────────────────────────
  // Plateforme MT5 avec des noms de colonnes plus explicites.
  // Discriminateurs : "volume" (pas "size"), "open price", "close price".
  {
    id: "fusion_markets",
    name: "Fusion Markets",
    description: "Export CSV de Fusion Markets (plateforme MT5 avec colonnes renommées)",

    // Colonnes caractéristiques — "open price" et "close price" distinguent
    // ce format du MT5 standard qui utilise juste "price".
    signatureHeaders: [
      "ticket",
      "open time",
      "type",
      "volume",      // MT5 utilise "size" — ici c'est "volume"
      "symbol",
      "open price",  // MT5 utilise "price" — ici "open price" est explicite
      "s / l",       // espaces autour du slash : spécifique MT5/Fusion
      "t / p",
      "close time",
      "close price", // colonne de sortie explicite
      "commission",
      "swap",
      "profit",
    ],

    // Mapping précis pour ce format
    fieldAliases: {
      "ticket": "external_id",
      "open time": "opened_at",
      "type": "side",
      "volume": "volume",
      "symbol": "symbol",
      "open price": "entry_price",
      "s / l": "stop_loss",
      "t / p": "take_profit",
      "close time": "closed_at",
      "close price": "exit_price",
      "commission": "commission",
      "swap": "swap",
      "profit": "net_pnl",
    },

    minScoreHigh: 0.75,
    minScoreMedium: 0.50,
  },

  // ── MetaTrader 5 ────────────────────────────────────────
  // Export statement HTML de MT5.
  // Discriminateurs : "ticket", "size", "s / l" (avec espaces), "t / p".
  {
    id: "mt5",
    name: "MetaTrader 5",
    description: "Export statement HTML d'un compte MetaTrader 5",

    // "ticket" + "size" + "s / l" distinguent MT5 de MT4 ("order", "s/l")
    signatureHeaders: [
      "ticket",
      "open time",
      "type",
      "size",     // MT4 utilise aussi "size", mais MT4 a "order" au lieu de "ticket"
      "symbol",
      "price",    // prix d'ouverture (ambiguë en générique, précis ici)
      "s / l",    // "S / L" avec espaces — signature MT5 (pas dans ALIAS_MAP générique)
      "t / p",    // "T / P" avec espaces — signature MT5
      "close time",
      "commission",
      "swap",
      "profit",
    ],

    // Couvre "s / l" et "t / p" que l'ALIAS_MAP générique ne reconnaît pas
    fieldAliases: {
      "ticket": "external_id",
      "open time": "opened_at",
      "type": "side",
      "size": "volume",
      "symbol": "symbol",
      "price": "entry_price",
      "s / l": "stop_loss",  // non couvert par ALIAS_MAP générique
      "t / p": "take_profit", // non couvert par ALIAS_MAP générique
      "close time": "closed_at",
      "commission": "commission",
      "swap": "swap",
      "profit": "net_pnl",
    },

    minScoreHigh: 0.75,
    minScoreMedium: 0.50,
  },

  // ── MetaTrader 4 ────────────────────────────────────────
  // Export statement HTML de MT4.
  // Discriminateurs : "order" (pas "ticket"), "s/l" sans espaces.
  {
    id: "mt4",
    name: "MetaTrader 4",
    description: "Export statement HTML d'un compte MetaTrader 4",

    // "order" est le discriminateur principal vs MT5 qui utilise "ticket"
    signatureHeaders: [
      "order",    // MT4 utilise "order", MT5 utilise "ticket"
      "open time",
      "type",
      "size",
      "symbol",
      "price",
      "s/l",      // MT4 : sans espaces autour du slash
      "t/p",      // MT4 : sans espaces autour du slash
      "close time",
      "profit",
    ],

    fieldAliases: {
      "order": "external_id",
      "open time": "opened_at",
      "type": "side",
      "size": "volume",
      "symbol": "symbol",
      "price": "entry_price",
      "s/l": "stop_loss",
      "t/p": "take_profit",
      "close time": "closed_at",
      "profit": "net_pnl",
    },

    minScoreHigh: 0.75,
    minScoreMedium: 0.50,
  },
];
