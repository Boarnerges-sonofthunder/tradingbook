// ============================================================
// Validation - Parametres utilisateur
// ============================================================
// Correspond a UserSettings dans types/settings.ts.
// ============================================================

import { z } from "zod";
import { SUPPORTED_DISPLAY_CURRENCIES } from "../types/settings";

export const ThemePreferenceSchema = z.enum(["dark", "light"], {
  error: "Le theme doit etre 'dark' ou 'light'",
});

export const LanguageCodeSchema = z.enum(["fr", "en"], {
  error: "La langue doit etre 'fr' ou 'en'",
});

export const DateTimeFormatPreferenceSchema = z.enum(
  ["local_24h", "local_12h", "iso"],
  {
    error: "Le format date/heure est invalide",
  },
);

export const StartupPagePreferenceSchema = z.enum(
  [
    "/",
    "/trades",
    "/analytics",
    "/backtesting",
    "/calendar",
    "/imports",
    "/mt5",
    "/backups",
    "/logs",
    "/settings",
  ],
  {
    error: "La page de demarrage est invalide",
  },
);

export const DisplayCurrencyCodeSchema = z.enum(SUPPORTED_DISPLAY_CURRENCIES, {
  error: "La devise d'affichage est invalide",
});

export const UserSettingsSchema = z.object({
  theme: ThemePreferenceSchema,
  language: LanguageCodeSchema,
  defaultCurrency: DisplayCurrencyCodeSchema,
  timezone: z
    .string()
    .min(1, "La timezone est requise")
    .max(100, "Timezone trop longue"),
  tradesPerPage: z
    .number()
    .int("Le nombre de trades par page doit etre entier")
    .min(5, "Minimum 5 trades par page")
    .max(200, "Maximum 200 trades par page"),
  defaultStartupPage: StartupPagePreferenceSchema,
  dateTimeFormat: DateTimeFormatPreferenceSchema,
  defaultLotSize: z
    .number()
    .positive("La taille de lot par defaut doit etre positive")
    .max(10_000, "Taille de lot trop elevee"),
  mt5AccountId: z.string().max(100, "Identifiant MT5 trop long").nullable(),
  mt5DataPath: z.string().max(500, "Chemin trop long (max 500 car.)").nullable(),
});

/** Mise a jour partielle pour saveSettings(Partial<UserSettings>). */
export const PartialUserSettingsSchema = UserSettingsSchema.partial();
