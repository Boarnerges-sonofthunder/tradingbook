import { DEFAULT_SETTINGS } from "../../types";
import type { UserSettings } from "../../types";

type DateLike = string | Date | null | undefined;
type CurrencySettingsLike = Pick<UserSettings, "language" | "defaultCurrency">;

interface MoneyFormatOptions {
  fallback?: string;
  signed?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  currency?: string;
}

export function getSettingsLocale(settings: Pick<UserSettings, "language">): string {
  return settings.language === "en" ? "en-US" : "fr-FR";
}

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getTimeOptions(settings: UserSettings): Intl.DateTimeFormatOptions {
  if (settings.dateTimeFormat === "local_12h") {
    return { hour12: true };
  }
  return { hour12: false };
}

function withSafeTimeZone(
  settings: UserSettings,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  return {
    ...options,
    timeZone: settings.timezone || DEFAULT_SETTINGS.timezone,
  };
}

/**
 * Formatte une date via les preferences utilisateur.
 * Les appels consommateurs restent simples et n'ont pas a manipuler Intl.
 */
export function formatDateForSettings(
  value: DateLike,
  settings: UserSettings,
  fallback = "-",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  if (settings.dateTimeFormat === "iso") return date.toISOString().slice(0, 10);

  try {
    return date.toLocaleDateString(
      getSettingsLocale(settings),
      withSafeTimeZone(settings, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    );
  } catch {
    return date.toLocaleDateString(getSettingsLocale(DEFAULT_SETTINGS));
  }
}

export function formatDateTimeForSettings(
  value: DateLike,
  settings: UserSettings,
  fallback = "-",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  if (settings.dateTimeFormat === "iso") return date.toISOString();

  try {
    return date.toLocaleString(
      getSettingsLocale(settings),
      withSafeTimeZone(settings, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...getTimeOptions(settings),
      }),
    );
  } catch {
    return date.toLocaleString(getSettingsLocale(DEFAULT_SETTINGS));
  }
}

export function formatShortDateTimeForSettings(
  value: DateLike,
  settings: UserSettings,
  fallback = "-",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  if (settings.dateTimeFormat === "iso") return date.toISOString();

  try {
    return date.toLocaleString(
      getSettingsLocale(settings),
      withSafeTimeZone(settings, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        ...getTimeOptions(settings),
      }),
    );
  } catch {
    return date.toLocaleString(getSettingsLocale(DEFAULT_SETTINGS));
  }
}

export function formatNumberForSettings(
  value: number,
  settings: Pick<UserSettings, "language">,
  options?: Intl.NumberFormatOptions,
): string {
  return value.toLocaleString(getSettingsLocale(settings), options);
}

/**
 * Formate un montant selon la devise d'affichage choisie par l'utilisateur.
 * Important : cette fonction ne convertit jamais la valeur; elle change
 * uniquement son habillage visuel (code devise, separateurs, signe).
 */
export function formatMoneyForSettings(
  value: number | null,
  settings: CurrencySettingsLike,
  options: MoneyFormatOptions = {},
): string {
  const {
    fallback = "-",
    signed = false,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    currency = settings.defaultCurrency,
  } = options;

  if (value === null || !Number.isFinite(value)) return fallback;

  const sign = signed && value > 0 ? "+" : "";

  try {
    return `${sign}${new Intl.NumberFormat(getSettingsLocale(settings), {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value)}`;
  } catch {
    return `${sign}${value.toLocaleString(getSettingsLocale(DEFAULT_SETTINGS), {
      minimumFractionDigits,
      maximumFractionDigits,
    })} ${currency}`;
  }
}
