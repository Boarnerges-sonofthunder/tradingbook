import { useEffect, useMemo, useState } from "react";
import { useNotification, useUserSettings } from "../../hooks";
import {
  getTypedSettings,
  saveSettings,
} from "../../services/settings/settingsService";
import { t } from "../../utils/i18n";
import type { UserSettings } from "../../types";
import SettingsSection from "./components/SettingsSection";
import GeneralSettings from "./components/GeneralSettings";
import CurrencySettings from "./components/CurrencySettings";
import TimezoneSettings from "./components/TimezoneSettings";
import TradingSessionsSettings from "./components/TradingSessionsSettings";
import ThemeSettings from "./components/ThemeSettings";
import MT5Settings from "./components/MT5Settings";
import AISettings from "./components/AISettings";
import AboutSettings from "./components/AboutSettings";

interface SaveSettingsOptions {
  silent?: boolean;
}

export default function SettingsPage() {
  const notify = useNotification();
  const { language } = useUserSettings();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSettings() {
    setLoading(true);
    try {
      setSettings(await getTypedSettings());
    } catch {
      notify.error(t(language, "settings_load_error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(
    partial: Partial<UserSettings>,
    options: SaveSettingsOptions = {},
  ) {
    await saveSettings(partial);
    setSettings((current) => (current ? { ...current, ...partial } : current));
    if (!options.silent) {
      notify.success(t(language, "settings_saved"));
    }
  }

  const content = useMemo(() => {
    if (loading) {
      return (
        <p className="settings-empty">{t(language, "settings_loading")}</p>
      );
    }

    if (!settings) {
      return (
        <p className="settings-empty">{t(language, "settings_unavailable")}</p>
      );
    }

    return (
      <div className="settings-sections">
        <SettingsSection
          id="general"
          title={t(language, "settings_general_title")}
          description={t(language, "settings_general_desc")}
        >
          <GeneralSettings settings={settings} onSave={handleSave} />
        </SettingsSection>

        <SettingsSection
          id="currency"
          title={t(language, "settings_currency_title")}
          description={t(language, "settings_currency_desc")}
        >
          <CurrencySettings settings={settings} onSave={handleSave} />
        </SettingsSection>

        <SettingsSection
          id="timezone"
          title={t(language, "settings_timezone_title")}
          description={t(language, "settings_timezone_desc")}
        >
          <TimezoneSettings settings={settings} onSave={handleSave} />
        </SettingsSection>

        <SettingsSection
          id="sessions"
          title={t(language, "settings_sessions_title")}
          description={t(language, "settings_sessions_desc")}
        >
          <TradingSessionsSettings />
        </SettingsSection>

        <SettingsSection
          id="theme"
          title={t(language, "settings_theme_title")}
          description={t(language, "settings_theme_desc")}
        >
          <ThemeSettings settings={settings} onSave={handleSave} />
        </SettingsSection>

        <SettingsSection
          id="mt5"
          title={t(language, "settings_mt5_title")}
          description={t(language, "settings_mt5_desc")}
        >
          <MT5Settings settings={settings} onSave={handleSave} />
        </SettingsSection>

        <SettingsSection
          id="ai"
          title={t(language, "settings_ai_title")}
          description={t(language, "settings_ai_desc")}
        >
          <AISettings />
        </SettingsSection>

        <SettingsSection
          id="about"
          title={t(language, "settings_about_title")}
          description={t(language, "settings_about_desc")}
        >
          <AboutSettings />
        </SettingsSection>
      </div>
    );
  }, [language, loading, notify, settings]);

  useEffect(() => {
    void loadSettings();
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="content-max settings-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">{t(language, "settings_page_title")}</h1>
          <p className="page-subtitle">
            {t(language, "settings_page_subtitle")}
          </p>
        </div>
      </div>

      {content}
    </div>
  );
}
