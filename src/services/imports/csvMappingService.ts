// ============================================================
// CSV Mapping Service — TradingBook
// ============================================================
// Responsabilités :
//   1. Catalogue des champs internes (TRADE_FIELDS_META)
//   2. Table d'aliases pour l'auto-détection (ALIAS_MAP)
//   3. Normalisation des en-têtes CSV
//   4. Détection automatique du mapping colonnes → champs
//   5. Validation des champs obligatoires
//
// Ce service est purement fonctionnel (pas d'effets de bord).
// Utilisé par CsvMappingSection pour pré-remplir l'interface.
//
// Formats couverts par l'auto-détection :
//   - MetaTrader 5 (export historique deals/trades)
//   - Fusion Markets CSV
//   - Formats génériques anglais / français
// ============================================================

import type {
  TradeField,
  TradeFieldMeta,
  CsvColumnMapping,
} from "../../types/csvImport";

// ─── Catalogue des champs internes ─────────────────────────

/**
 * Métadonnées des 17 champs importables, dans l'ordre d'affichage.
 *
 * Champs obligatoires (required = true) :
 *   symbol · side · opened_at · entry_price · volume
 *
 * Champs pour trades fermés (closedRequired = true) :
 *   closed_at · exit_price · net_pnl
 *
 * Champs optionnels : tous les autres.
 */
export const TRADE_FIELDS_META: TradeFieldMeta[] = [
  // ── Identification ────────────────────────────────────────
  {
    key: "external_id",
    label: "Identifiant externe",
    description: "Numéro ticket, ordre ou deal du broker",
    required: false,
    closedRequired: false,
    type: "text",
  },
  // ── Instrument ────────────────────────────────────────────
  {
    key: "symbol",
    label: "Symbole",
    description: "Instrument financier (ex : EURUSD, XAUUSD)",
    required: true,
    closedRequired: false,
    type: "text",
  },
  {
    key: "side",
    label: "Sens",
    description: "Direction du trade : buy / sell",
    required: true,
    closedRequired: false,
    type: "side",
  },
  {
    key: "status",
    label: "Statut",
    description: "État du trade : open / closed / cancelled",
    required: false,
    closedRequired: false,
    type: "text",
  },
  // ── Cycle de vie ──────────────────────────────────────────
  {
    key: "opened_at",
    label: "Date d'ouverture",
    description: "Date et heure d'entrée en position",
    required: true,
    closedRequired: false,
    type: "datetime",
  },
  {
    key: "closed_at",
    label: "Date de fermeture",
    description: "Date et heure de sortie de position",
    required: false,
    closedRequired: true,
    type: "datetime",
  },
  // ── Prix ──────────────────────────────────────────────────
  {
    key: "entry_price",
    label: "Prix d'entrée",
    description: "Prix d'ouverture de la position",
    required: true,
    closedRequired: false,
    type: "number",
  },
  {
    key: "exit_price",
    label: "Prix de sortie",
    description: "Prix de fermeture de la position",
    required: false,
    closedRequired: true,
    type: "number",
  },
  {
    key: "stop_loss",
    label: "Stop Loss",
    description: "Niveau de stop loss initial",
    required: false,
    closedRequired: false,
    type: "number",
  },
  {
    key: "take_profit",
    label: "Take Profit",
    description: "Niveau de take profit initial",
    required: false,
    closedRequired: false,
    type: "number",
  },
  // ── Volume ────────────────────────────────────────────────
  {
    key: "volume",
    label: "Volume (lots)",
    description: "Taille de la position en lots",
    required: true,
    closedRequired: false,
    type: "number",
  },
  // ── Frais ─────────────────────────────────────────────────
  {
    key: "commission",
    label: "Commission",
    description: "Frais de commission du broker",
    required: false,
    closedRequired: false,
    type: "number",
  },
  {
    key: "swap",
    label: "Swap",
    description: "Frais de rollover overnight",
    required: false,
    closedRequired: false,
    type: "number",
  },
  {
    key: "fees",
    label: "Frais divers",
    description: "Autres frais (taxes, etc.)",
    required: false,
    closedRequired: false,
    type: "number",
  },
  // ── P&L ──────────────────────────────────────────────────
  {
    key: "gross_pnl",
    label: "P&L brut",
    description: "Profit/perte avant déduction des frais",
    required: false,
    closedRequired: false,
    type: "number",
  },
  {
    key: "net_pnl",
    label: "P&L net",
    description: "Profit/perte final après frais",
    required: false,
    closedRequired: true,
    type: "number",
  },
  // ── Contexte ─────────────────────────────────────────────
  {
    key: "currency",
    label: "Devise",
    description: "Devise du compte (ex : USD, EUR)",
    required: false,
    closedRequired: false,
    type: "text",
  },
];

// ─── Champs requis ─────────────────────────────────────────

/**
 * Champs indispensables pour créer un trade de base.
 * L'import sera refusé si l'un d'eux n'est pas mappé.
 */
export const REQUIRED_FIELDS: TradeField[] = [
  "symbol",
  "side",
  "opened_at",
  "entry_price",
  "volume",
];

// ─── Table d'aliases ───────────────────────────────────────

/**
 * Table de correspondances normalisées.
 * Clé = résultat de `normalizeHeader(nomColonneCSV)`.
 * Valeur = champ interne TradingBook.
 *
 * Couvre :
 *   - MetaTrader 5 export deals (Time, Deal, Symbol, Direction…)
 *   - Fusion Markets CSV (Ticket, Open Price, Open Time…)
 *   - Formats génériques anglais et français
 *
 * Règle de priorité : si plusieurs headers normalisés correspondent
 * au même champ, le PREMIER trouvé dans la liste des headers CSV gagne.
 */
const ALIAS_MAP: Record<string, TradeField> = {
  // ── external_id ─────────────────────────────────────────
  ticket: "external_id",
  "ticket #": "external_id",
  "ticket no": "external_id",
  "ticket no.": "external_id",
  order: "external_id",
  "order #": "external_id",
  "order id": "external_id",
  deal: "external_id",
  "deal #": "external_id",
  "deal id": "external_id",
  id: "external_id",
  "trade id": "external_id",
  position: "external_id",
  "position id": "external_id",

  // ── symbol ──────────────────────────────────────────────
  symbol: "symbol",
  instrument: "symbol",
  ticker: "symbol",
  pair: "symbol",
  asset: "symbol",
  product: "symbol",
  market: "symbol",
  "currency pair": "symbol",
  "trading instrument": "symbol",
  symbole: "symbol",

  // ── side ────────────────────────────────────────────────
  type: "side",
  side: "side",
  direction: "side",
  action: "side",
  "buy/sell": "side",
  "trade type": "side",
  "order type": "side",
  "trade direction": "side",
  sens: "side",
  "type operation": "side",
  "type d operation": "side",

  // ── status ──────────────────────────────────────────────
  status: "status",
  state: "status",
  statut: "status",
  etat: "status",

  // ── opened_at ───────────────────────────────────────────
  "open time": "opened_at",
  opentime: "opened_at",
  "open date": "opened_at",
  opendate: "opened_at",
  "entry time": "opened_at",
  entrytime: "opened_at",
  "entry date": "opened_at",
  "entry datetime": "opened_at",
  "open datetime": "opened_at",
  "date open": "opened_at",
  "date ouverture": "opened_at",
  ouverture: "opened_at",
  "time open": "opened_at",
  "date/time": "opened_at",
  datetime: "opened_at",
  // Note: "time" et "date" seuls sont ambigus — positionnés en dernier
  time: "opened_at",
  date: "opened_at",

  // ── closed_at ───────────────────────────────────────────
  "close time": "closed_at",
  closetime: "closed_at",
  "close date": "closed_at",
  closedate: "closed_at",
  "exit time": "closed_at",
  exittime: "closed_at",
  "exit date": "closed_at",
  "exit datetime": "closed_at",
  "close datetime": "closed_at",
  "date close": "closed_at",
  "date fermeture": "closed_at",
  fermeture: "closed_at",
  "time close": "closed_at",

  // ── entry_price ─────────────────────────────────────────
  "open price": "entry_price",
  openprice: "entry_price",
  "entry price": "entry_price",
  entryprice: "entry_price",
  "price open": "entry_price",
  "open rate": "entry_price",
  "entry rate": "entry_price",
  "bid open": "entry_price",
  "prix ouverture": "entry_price",
  "prix d ouverture": "entry_price",
  "prix entree": "entry_price",
  "prix d entree": "entry_price",
  // Note: "price" seul est ambigu — mappé en dernier recours
  price: "entry_price",

  // ── exit_price ──────────────────────────────────────────
  "close price": "exit_price",
  closeprice: "exit_price",
  "exit price": "exit_price",
  exitprice: "exit_price",
  "price close": "exit_price",
  "close rate": "exit_price",
  "exit rate": "exit_price",
  "closing price": "exit_price",
  "prix fermeture": "exit_price",
  "prix de fermeture": "exit_price",
  "prix sortie": "exit_price",

  // ── volume ──────────────────────────────────────────────
  volume: "volume",
  lot: "volume",
  lots: "volume",
  size: "volume",
  qty: "volume",
  quantity: "volume",
  "trade size": "volume",
  "position size": "volume",
  "lot size": "volume",
  taille: "volume",
  quantite: "volume",

  // ── stop_loss ───────────────────────────────────────────
  "stop loss": "stop_loss",
  stoploss: "stop_loss",
  sl: "stop_loss",
  stop: "stop_loss",
  "s/l": "stop_loss",
  "s l": "stop_loss",

  // ── take_profit ─────────────────────────────────────────
  "take profit": "take_profit",
  takeprofit: "take_profit",
  tp: "take_profit",
  target: "take_profit",
  "t/p": "take_profit",
  "t p": "take_profit",

  // ── commission ──────────────────────────────────────────
  commission: "commission",
  commissions: "commission",
  comm: "commission",
  "commission (usd)": "commission",
  "commission usd": "commission",

  // ── swap ────────────────────────────────────────────────
  swap: "swap",
  rollover: "swap",
  "overnight fee": "swap",
  financing: "swap",
  "swap (usd)": "swap",

  // ── fees ────────────────────────────────────────────────
  fees: "fees",
  fee: "fees",
  taxes: "fees",
  tax: "fees",
  "other charges": "fees",
  "autres frais": "fees",

  // ── gross_pnl ───────────────────────────────────────────
  "gross pnl": "gross_pnl",
  "gross p/l": "gross_pnl",
  "gross profit": "gross_pnl",
  "gross loss": "gross_pnl",
  gross: "gross_pnl",

  // ── net_pnl ─────────────────────────────────────────────
  profit: "net_pnl",
  pnl: "net_pnl",
  "p&l": "net_pnl",
  "p/l": "net_pnl",
  "net p/l": "net_pnl",
  "net pnl": "net_pnl",
  "net profit": "net_pnl",
  "net loss": "net_pnl",
  "profit/loss": "net_pnl",
  result: "net_pnl",
  resultat: "net_pnl",
  "gain/perte": "net_pnl",
  "profit (usd)": "net_pnl",
  "profit usd": "net_pnl",
  "net p l": "net_pnl",

  // ── currency ────────────────────────────────────────────
  currency: "currency",
  curr: "currency",
  ccy: "currency",
  devise: "currency",
  "account currency": "currency",
};

// ─── Helpers internes ──────────────────────────────────────

/**
 * Normalise un en-tête CSV pour la recherche dans ALIAS_MAP.
 *
 * Applique :
 *   - trim (suppression espaces en début/fin)
 *   - lowercase
 *   - remplacement de séquences whitespace/underscore/tiret → espace simple
 *   - suppression des accents (ex: "clôture" → "cloture")
 *
 * Exemples :
 *   "Open Price "  → "open price"
 *   "Open_Price"   → "open price"
 *   "Close  Time"  → "close time"
 *   "Date/Heure"   → "date/heure"
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprimer les diacritiques
    .replace(/[\s_]+/g, " "); // normaliser les séparateurs
}

// ─── Mapping vide ──────────────────────────────────────────

/**
 * Construit un mapping vide : tous les champs → null.
 * Utilisé comme valeur initiale avant l'auto-détection.
 */
export function buildEmptyFieldMapping(): Record<TradeField, string | null> {
  return Object.fromEntries(
    TRADE_FIELDS_META.map((f) => [f.key, null])
  ) as Record<TradeField, string | null>;
}

// ─── Validation ────────────────────────────────────────────

/**
 * Valide un mapping champ → colonne CSV.
 *
 * Vérifie que tous les champs `required` (REQUIRED_FIELDS) ont une colonne.
 * Les champs `closedRequired` sont optionnels à ce stade.
 *
 * @returns isValid + liste des champs requis manquants
 */
export function validateMapping(
  fieldToColumn: Record<TradeField, string | null>
): { isValid: boolean; missingRequired: TradeField[] } {
  const missingRequired = REQUIRED_FIELDS.filter((f) => !fieldToColumn[f]);
  return {
    isValid: missingRequired.length === 0,
    missingRequired,
  };
}

// ─── Auto-détection ────────────────────────────────────────

/**
 * Tente de détecter automatiquement le mapping colonnes CSV → champs internes.
 *
 * Algorithme :
 *   1. Pour chaque en-tête CSV, normaliser le nom via `normalizeHeader()`
 *   2. Chercher dans ALIAS_MAP
 *   3. Si un champ interne n'a pas encore de mapping → l'assigner
 *   4. Si plusieurs headers pointent vers le même champ, le premier gagne
 *
 * Les colonnes sans alias connu sont ignorées (le champ reste null).
 *
 * @param headers  En-têtes CSV (ordre de la première ligne du fichier)
 * @returns        CsvColumnMapping avec les mappings détectés et la validation
 */
export function autoDetectMapping(headers: string[]): CsvColumnMapping {
  const fieldToColumn = buildEmptyFieldMapping();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const field = ALIAS_MAP[normalized];

    if (field !== undefined && fieldToColumn[field] === null) {
      // Assigner uniquement si le champ n'est pas encore mappé (premier trouvé)
      fieldToColumn[field] = header;
    }
  }

  const { isValid, missingRequired } = validateMapping(fieldToColumn);
  return { fieldToColumn, isValid, missingRequired };
}

/**
 * Retourne les métadonnées de tous les champs internes, dans l'ordre d'affichage.
 * Pratique pour générer l'interface de mapping sans importer TRADE_FIELDS_META.
 */
export function getFieldsMeta(): TradeFieldMeta[] {
  return TRADE_FIELDS_META;
}
