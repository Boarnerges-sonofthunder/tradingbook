// ============================================================
// Service — Settings (validation + logique métier)
// ============================================================
// Modèle clé-valeur : table `settings` (key TEXT PK, value TEXT).
// Les valeurs sont sérialisées en texte ; ce service gère la
// conversion vers/depuis les types TypeScript.
// ============================================================

import { createLogger } from "../logging";
import {
  invalidateSettingsCache,
  withSettingsCache,
} from "../cache/domainCache";
import { DEFAULT_SETTINGS, SUPPORTED_DISPLAY_CURRENCIES } from "../../types";
import type { UserSettings, SettingKey } from "../../types";
import { validate, PartialUserSettingsSchema } from "../../validation";
import * as repo from "../../repositories/settingsRepository";

const logger = createLogger("settings");
export const USER_SETTINGS_CHANGED_EVENT = "tradingbook:user-settings-changed";

// La table `settings` melange encore des cles historiques snake_case et
// camelCase. Ce mapping garde SQLite comme source de verite sans exposer
// ces details au reste de l'application.
const SETTING_STORAGE_KEYS: Record<SettingKey, string> = {
  theme: "theme",
  language: "language",
  defaultCurrency: "default_currency",
  timezone: "timezone",
  tradesPerPage: "tradesPerPage",
  defaultStartupPage: "defaultStartupPage",
  dateTimeFormat: "dateTimeFormat",
  defaultLotSize: "defaultLotSize",
  mt5AccountId: "mt5AccountId",
  mt5DataPath: "mt5DataPath",
  twoConsecutiveLossAlertEnabled: "twoConsecutiveLossAlertEnabled",
};

const LEGACY_SETTING_ALIASES: Partial<Record<SettingKey, string[]>> = {
  defaultCurrency: ["currency"],
};

function parseNumberSetting(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNullableSetting(value: string | undefined, fallback: string | null): string | null {
  if (value == null) return fallback;
  return value.trim() === "" ? null : value;
}

function parseEnumSetting<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseBooleanSetting(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

function readRawSetting(
  raw: Record<string, string>,
  key: SettingKey,
): string | undefined {
  const storageKey = SETTING_STORAGE_KEYS[key];
  if (raw[storageKey] != null) return raw[storageKey];

  const aliases = LEGACY_SETTING_ALIASES[key] ?? [];
  for (const alias of aliases) {
    if (raw[alias] != null) return raw[alias];
  }

  return undefined;
}

// ------------------------------------------------------------
// Primitives (clé / valeur brute)
// ------------------------------------------------------------

/** Lit la valeur brute d'une clé. Retourne null si absente. */
export async function getSetting(key: string): Promise<string | null> {
  return withSettingsCache("getSetting", [key], () => repo.findSetting(key));
}

/** Écrit ou remplace une valeur (UPSERT). */
export async function setSetting(key: string, value: string): Promise<void> {
  await repo.upsertSetting(key, value);
  invalidateSettingsCache();
}

/** Retourne toutes les entrées sous forme de Record<string, string>. */
export async function getAllSettingsRaw(): Promise<Record<string, string>> {
  return withSettingsCache("getAllSettingsRaw", [], () => repo.findAllSettings());
}

// ------------------------------------------------------------
// API typée (UserSettings)
// ------------------------------------------------------------

/**
 * Lit toutes les préférences utilisateur.
 * Les clés manquantes sont comblées par DEFAULT_SETTINGS.
 */
export async function getTypedSettings(): Promise<UserSettings> {
  return withSettingsCache("getTypedSettings", [], async () => {
    const raw = await getAllSettingsRaw();

    return {
      theme: parseEnumSetting(
        readRawSetting(raw, "theme"),
        ["dark", "light"],
        DEFAULT_SETTINGS.theme,
      ),
      language: parseEnumSetting(
        readRawSetting(raw, "language"),
        ["fr", "en"],
        DEFAULT_SETTINGS.language,
      ),
      defaultCurrency: parseEnumSetting(
        readRawSetting(raw, "defaultCurrency"),
        SUPPORTED_DISPLAY_CURRENCIES,
        DEFAULT_SETTINGS.defaultCurrency,
      ),
      timezone: readRawSetting(raw, "timezone") ?? DEFAULT_SETTINGS.timezone,
      tradesPerPage: parseNumberSetting(
        readRawSetting(raw, "tradesPerPage"),
        DEFAULT_SETTINGS.tradesPerPage,
      ),
      defaultStartupPage: parseEnumSetting(
        readRawSetting(raw, "defaultStartupPage"),
        ["/", "/trades", "/analytics", "/backtesting", "/calendar", "/imports", "/mt5", "/backups", "/logs", "/settings"],
        DEFAULT_SETTINGS.defaultStartupPage,
      ),
      dateTimeFormat: parseEnumSetting(
        readRawSetting(raw, "dateTimeFormat"),
        ["local_24h", "local_12h", "iso"],
        DEFAULT_SETTINGS.dateTimeFormat,
      ),
      defaultLotSize: parseNumberSetting(
        readRawSetting(raw, "defaultLotSize"),
        DEFAULT_SETTINGS.defaultLotSize,
      ),
      mt5AccountId: parseNullableSetting(
        readRawSetting(raw, "mt5AccountId"),
        DEFAULT_SETTINGS.mt5AccountId,
      ),
      mt5DataPath: parseNullableSetting(
        readRawSetting(raw, "mt5DataPath"),
        DEFAULT_SETTINGS.mt5DataPath,
      ),
      twoConsecutiveLossAlertEnabled: parseBooleanSetting(
        readRawSetting(raw, "twoConsecutiveLossAlertEnabled"),
        DEFAULT_SETTINGS.twoConsecutiveLossAlertEnabled,
      ),
    };
  });
}

/**
 * Persiste un sous-ensemble des préférences utilisateur.
 * Seules les clés fournies sont écrites ; les autres restent inchangées.
 */
export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  validate(PartialUserSettingsSchema, settings);
  const entries = Object.entries(settings) as Array<[SettingKey, UserSettings[SettingKey]]>;
  for (const [key, value] of entries) {
    const serialized = value === null ? "" : String(value);
    await setSetting(SETTING_STORAGE_KEYS[key], serialized);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(USER_SETTINGS_CHANGED_EVENT));
  }
  logger.info(`${entries.length} paramètre(s) sauvegardé(s)`);
}

/** Réinitialise tous les paramètres aux valeurs par défaut. */
export async function resetSettings(): Promise<void> {
  await saveSettings(DEFAULT_SETTINGS);
  logger.info("Paramètres réinitialisés aux valeurs par défaut");
}
