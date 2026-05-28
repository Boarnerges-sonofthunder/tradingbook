// ============================================================
// Constants — Plateformes de trading supportées
// ============================================================
// Phase 6 Étape 2.1 — Référentiel centralisé des plateformes.
//
// Ce fichier est la SOURCE DE VÉRITÉ pour les identifiants de plateformes.
// Les types SQLite (TradePlatform, ImportSource) doivent rester synchronisés
// avec ces constantes.
//
// ÉTAT D'IMPLÉMENTATION :
//   ✅ MT5    — bridge Python actif (Phase 6 Étapes 2 & 3)
//   🔲 MT4    — architecture préparée, bridge fichier à implémenter
//   ✅ CSV    — import CSV avec détection broker (Phase 5)
//   ✅ Manual — saisie manuelle (Phase 3)
//
// AJOUTER UNE NOUVELLE PLATEFORME :
//   1. Ajouter la clé dans TRADING_PLATFORMS
//   2. Ajouter le label dans PLATFORM_LABELS
//   3. Mettre à jour TradePlatform dans src/types/trade.ts
//   4. Mettre à jour ImportSource dans src/types/import.ts
//   5. Créer une migration SQLite pour les contraintes CHECK
//   6. Créer src/services/<platform>/
// ============================================================

// ─── Identifiants de plateforme ────────────────────────────

/**
 * Identifiants techniques des plateformes supportées ou prévues.
 *
 * Ces valeurs correspondent exactement aux colonnes `platform` et `source`
 * dans SQLite. Toute modification nécessite une migration de base de données.
 *
 * Contraintes SQLite actuelles (migration 002) :
 *   CHECK (platform IN ('mt5', 'csv', 'manual'))
 *   CHECK (source   IN ('mt5', 'csv', 'manual'))
 *
 * Contraintes SQLite après migration 005 (MT4 activé) :
 *   CHECK (platform IN ('mt5', 'mt4', 'csv', 'manual'))
 *   CHECK (source   IN ('mt5', 'mt4', 'csv', 'manual'))
 */
export const TRADING_PLATFORMS = {
  /** MetaTrader 5 — bridge Python actif, lecture seule. */
  MT5: "mt5",

  /**
   * MetaTrader 4 — bridge fichier (MQL4 EA export), lecture seule.
   * @requires Migration 005 avant utilisation réelle en SQLite.
   */
  MT4: "mt4",

  /** Import CSV générique avec détection de format broker. */
  CSV: "csv",

  /** Trade saisi manuellement par l'utilisateur. */
  MANUAL: "manual",
} as const;

/** Type dérivé des clés de TRADING_PLATFORMS. */
export type TradingPlatformKey = keyof typeof TRADING_PLATFORMS;

/** Type dérivé des valeurs de TRADING_PLATFORMS. */
export type TradingPlatformValue =
  (typeof TRADING_PLATFORMS)[TradingPlatformKey];

// ─── Labels affichés à l'utilisateur ──────────────────────

/**
 * Noms lisibles des plateformes pour l'interface utilisateur.
 *
 * Utilisation :
 *   import { PLATFORM_LABELS, TRADING_PLATFORMS } from "../constants/tradingPlatforms";
 *   const label = PLATFORM_LABELS[TRADING_PLATFORMS.MT5]; // "MetaTrader 5"
 */
export const PLATFORM_LABELS: Record<TradingPlatformValue, string> = {
  mt5: "MetaTrader 5",
  mt4: "MetaTrader 4",
  csv: "Import CSV",
  manual: "Saisie manuelle",
} as const;

// ─── Capacités par plateforme ──────────────────────────────

/**
 * Description des capacités de chaque plateforme.
 *
 * Permet à l'UI de savoir quelles fonctionnalités sont disponibles
 * pour chaque source de données.
 */
export interface PlatformCapabilities {
  /** Vrai si la plateforme supporte la synchronisation en direct. */
  supportsLiveSync: boolean;

  /** Vrai si la plateforme utilise un fichier export local. */
  supportsFileImport: boolean;

  /** Vrai si la plateforme est complètement implémentée. */
  isImplemented: boolean;

  /** Description courte de la méthode d'import. */
  importMethod: string;
}

/**
 * Capacités déclarées de chaque plateforme.
 *
 * Utilisé pour afficher l'état et les options disponibles dans l'UI
 * (ex: page Paramètres, page Imports).
 */
export const PLATFORM_CAPABILITIES: Record<
  TradingPlatformValue,
  PlatformCapabilities
> = {
  mt5: {
    supportsLiveSync: true,
    supportsFileImport: false,
    isImplemented: true,
    importMethod: "Bridge Python (mt5_bridge.py) via tauri-plugin-shell",
  },
  mt4: {
    supportsLiveSync: false,
    supportsFileImport: true,
    isImplemented: false,
    importMethod:
      "Fichier JSON/CSV exporté par un MQL4 EA local (à implémenter)",
  },
  csv: {
    supportsLiveSync: false,
    supportsFileImport: true,
    isImplemented: true,
    importMethod: "Import CSV avec détection automatique du format broker",
  },
  manual: {
    supportsLiveSync: false,
    supportsFileImport: false,
    isImplemented: true,
    importMethod: "Formulaire de saisie manuelle",
  },
} as const;

// ─── Chemins d'export MT4 connus ──────────────────────────

/**
 * Noms de fichiers d'export MT4 que mt4BridgeService cherchera
 * dans les dossiers `data/imports/` et `data/` de TradingBook.
 *
 * L'utilisateur peut configurer un chemin personnalisé dans les
 * paramètres (Phase 6 Étape future).
 *
 * Convention de nommage recommandée pour le MQL4 EA :
 *   mt4_export.json     — export JSON (format recommandé)
 *   mt4_export.csv      — export CSV (format alternatif)
 *   mt4_history.json    — alias accepté
 */
export const MT4_EXPORT_FILENAMES = [
  "mt4_export.json",
  "mt4_export.csv",
  "mt4_history.json",
  "mt4_history.csv",
] as const;

export type MT4ExportFilename = (typeof MT4_EXPORT_FILENAMES)[number];
