import { useState } from "react";
import type { ThemePreference, UserSettings } from "../../../types";
import { applyTheme } from "../../../constants/theme";

interface ThemeSettingsProps {
  settings: UserSettings;
  onSave: (
    settings: Partial<UserSettings>,
    options?: { silent?: boolean },
  ) => Promise<void>;
}

export default function ThemeSettings({ settings, onSave }: ThemeSettingsProps) {
  const [theme, setTheme] = useState<ThemePreference>(settings.theme);
  const [saving, setSaving] = useState(false);

  async function handleSelect(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    setSaving(true);
    try {
      await onSave({ theme: nextTheme }, { silent: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-choice-grid">
      <button
        type="button"
        className={`settings-choice${theme === "dark" ? " settings-choice--active" : ""}`}
        onClick={() => void handleSelect("dark")}
        disabled={saving}
      >
        <span className="settings-choice__title">Sombre</span>
        <span className="settings-choice__hint">Interface principale actuelle.</span>
      </button>
      <button
        type="button"
        className={`settings-choice${theme === "light" ? " settings-choice--active" : ""}`}
        onClick={() => void handleSelect("light")}
        disabled={saving}
      >
        <span className="settings-choice__title">Clair</span>
        <span className="settings-choice__hint">Thème préparé pour les prochaines phases.</span>
      </button>
    </div>
  );
}
