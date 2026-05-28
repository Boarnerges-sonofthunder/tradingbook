// ============================================================
// Types - Settings
// ============================================================
// Parametres utilisateur stockes dans la table SQLite `settings`.
// La table utilise un modele cle-valeur (key TEXT, value TEXT).
// ============================================================

export type ThemePreference = "dark" | "light";

export type LanguageCode = "fr" | "en";

export type DateTimeFormatPreference = "local_24h" | "local_12h" | "iso";

/**
 * Liste fermee des devises d'affichage supportees par TradingBook.
 * Cette devise sert uniquement au formatage UI; aucun montant n'est converti.
 */
export const SUPPORTED_DISPLAY_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "AUD",
] as const;

export type DisplayCurrencyCode =
  (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

export type StartupPagePreference =
  | "/"
  | "/trades"
  | "/analytics"
  | "/backtesting"
  | "/calendar"
  | "/imports"
  | "/mt5"
  | "/backups"
  | "/logs"
  | "/settings";

/**
 * Representation typee des preferences utilisateur.
 * Chaque champ correspond a une cle dans la table `settings`.
 */
export interface UserSettings {
  /** Theme de l'interface. */
  theme: ThemePreference;
  /** Langue de l'interface. */
  language: LanguageCode;
  /** Devise d'affichage globale des montants. */
  defaultCurrency: DisplayCurrencyCode;
  /** Timezone IANA utilisee pour les affichages date/heure. */
  timezone: string;
  /** Nombre de trades affiche par page dans les listes. */
  tradesPerPage: number;
  /** Page ouverte quand l'application demarre sur la racine. */
  defaultStartupPage: StartupPagePreference;
  /** Format d'affichage des dates et heures. */
  dateTimeFormat: DateTimeFormatPreference;
  /** Taille de lot par defaut pour les nouveaux trades. */
  defaultLotSize: number;
  /** Identifiant du compte MT5 (optionnel). */
  mt5AccountId: string | null;
  /** Chemin vers le dossier de donnees MT5 (optionnel). */
  mt5DataPath: string | null;
}

/** Cles valides de la table settings. */
export type SettingKey = keyof UserSettings;

/** Valeurs par defaut appliquees si la cle est absente de la base. */
export const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  language: "fr",
  defaultCurrency: "USD",
  timezone: "America/Toronto",
  tradesPerPage: 25,
  defaultStartupPage: "/",
  dateTimeFormat: "local_24h",
  defaultLotSize: 0.01,
  mt5AccountId: null,
  mt5DataPath: null,
};
