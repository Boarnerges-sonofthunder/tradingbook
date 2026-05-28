import { useState } from "react";
import type { UserSettings } from "../../../types";
import SettingsField from "./SettingsField";

interface TimezoneSettingsProps {
  settings: UserSettings;
  onSave: (settings: Partial<UserSettings>) => Promise<void>;
}

export default function TimezoneSettings({
  settings,
  onSave,
}: TimezoneSettingsProps) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ timezone: timezone.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <SettingsField
        label="Timezone locale"
        hint="Ex. : America/Toronto, Europe/Paris, UTC."
      >
        <input
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/Toronto"
        />
      </SettingsField>

      <div className="settings-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
