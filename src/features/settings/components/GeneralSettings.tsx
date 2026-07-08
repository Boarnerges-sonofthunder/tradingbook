import { useState } from "react";
import type {
  DateTimeFormatPreference,
  LanguageCode,
  StartupPagePreference,
  UserSettings,
} from "../../../types";
import { t } from "../../../utils/i18n";
import type { I18nKey } from "../../../utils/i18n";
import SettingsField from "./SettingsField";

interface GeneralSettingsProps {
  settings: UserSettings;
  onSave: (settings: Partial<UserSettings>) => Promise<void>;
}

const STARTUP_PAGES: Array<{ value: StartupPagePreference; key: I18nKey }> = [
  { value: "/", key: "nav_dashboard" },
  { value: "/trades", key: "nav_trades_journal" },
  { value: "/analytics", key: "nav_analytics" },
  { value: "/calendar", key: "nav_calendar" },
  { value: "/imports", key: "nav_import_csv" },
  { value: "/mt5", key: "nav_sync_mt5" },
  { value: "/backups", key: "nav_backups" },
  { value: "/logs", key: "nav_system_logs" },
  { value: "/settings", key: "nav_settings" },
];

const DATE_TIME_FORMATS: Array<{
  value: DateTimeFormatPreference;
  label: string;
}> = [
  { value: "local_24h", label: "Local 24h" },
  { value: "local_12h", label: "Local 12h" },
  { value: "iso", label: "ISO 8601" },
];

export default function GeneralSettings({
  settings,
  onSave,
}: GeneralSettingsProps) {
  const languageCode = settings.language;
  const [language, setLanguage] = useState<LanguageCode>(settings.language);
  const [tradesPerPage, setTradesPerPage] = useState(
    String(settings.tradesPerPage),
  );
  const [defaultStartupPage, setDefaultStartupPage] =
    useState<StartupPagePreference>(settings.defaultStartupPage);
  const [dateTimeFormat, setDateTimeFormat] =
    useState<DateTimeFormatPreference>(settings.dateTimeFormat);
  const [defaultLotSize, setDefaultLotSize] = useState(
    String(settings.defaultLotSize),
  );
  const [twoConsecutiveLossAlertEnabled, setTwoConsecutiveLossAlertEnabled] =
    useState(settings.twoConsecutiveLossAlertEnabled);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        language,
        tradesPerPage: Number(tradesPerPage),
        defaultStartupPage,
        dateTimeFormat,
        defaultLotSize: Number(defaultLotSize),
        twoConsecutiveLossAlertEnabled,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <SettingsField
        label={t(languageCode, "general_language_label")}
        hint={t(languageCode, "general_language_hint")}
      >
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        >
          <option value="fr">{t(languageCode, "general_language_fr")}</option>
          <option value="en">{t(languageCode, "general_language_en")}</option>
        </select>
      </SettingsField>

      <SettingsField
        label={t(languageCode, "general_trades_page_label")}
        hint={t(languageCode, "general_trades_page_hint")}
      >
        <input
          type="number"
          min="5"
          max="200"
          step="5"
          value={tradesPerPage}
          onChange={(event) => setTradesPerPage(event.target.value)}
        />
      </SettingsField>

      <SettingsField
        label={t(languageCode, "general_start_page_label")}
        hint={t(languageCode, "general_start_page_hint")}
      >
        <select
          value={defaultStartupPage}
          onChange={(event) =>
            setDefaultStartupPage(event.target.value as StartupPagePreference)
          }
        >
          {STARTUP_PAGES.map((page) => (
            <option key={page.value} value={page.value}>
              {t(languageCode, page.key)}
            </option>
          ))}
        </select>
      </SettingsField>

      <SettingsField
        label={t(languageCode, "general_datetime_format_label")}
        hint={t(languageCode, "general_datetime_format_hint")}
      >
        <select
          value={dateTimeFormat}
          onChange={(event) =>
            setDateTimeFormat(event.target.value as DateTimeFormatPreference)
          }
        >
          {DATE_TIME_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </select>
      </SettingsField>

      <SettingsField
        label={t(languageCode, "general_default_lot_label")}
        hint={t(languageCode, "general_default_lot_hint")}
      >
        <input
          type="number"
          min="0"
          step="0.01"
          value={defaultLotSize}
          onChange={(event) => setDefaultLotSize(event.target.value)}
        />
      </SettingsField>

      <SettingsField
        label={t(languageCode, "general_two_losses_alert_label")}
        hint={t(languageCode, "general_two_losses_alert_hint")}
      >
        <select
          value={String(twoConsecutiveLossAlertEnabled)}
          onChange={(event) =>
            setTwoConsecutiveLossAlertEnabled(event.target.value === "true")
          }
        >
          <option value="true">{t(languageCode, "general_enabled")}</option>
          <option value="false">{t(languageCode, "general_disabled")}</option>
        </select>
      </SettingsField>

      <div className="settings-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving
            ? t(languageCode, "general_saving")
            : t(languageCode, "general_save")}
        </button>
      </div>
    </div>
  );
}
