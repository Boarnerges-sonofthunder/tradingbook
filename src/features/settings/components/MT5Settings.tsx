import { useState } from "react";
import type { UserSettings } from "../../../types";
import SettingsField from "./SettingsField";

interface MT5SettingsProps {
  settings: UserSettings;
  onSave: (settings: Partial<UserSettings>) => Promise<void>;
}

export default function MT5Settings({ settings, onSave }: MT5SettingsProps) {
  const [mt5AccountId, setMt5AccountId] = useState(settings.mt5AccountId ?? "");
  const [mt5DataPath, setMt5DataPath] = useState(settings.mt5DataPath ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        mt5AccountId: mt5AccountId.trim() || null,
        mt5DataPath: mt5DataPath.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <SettingsField
        label="Compte MT5"
        hint="Identifiant local optionnel pour filtrer les synchronisations."
      >
        <input
          value={mt5AccountId}
          onChange={(event) => setMt5AccountId(event.target.value)}
          placeholder="Ex. : 12345678"
        />
      </SettingsField>

      <SettingsField
        label="Dossier MT5"
        hint="Chemin local optionnel. Aucun mot de passe n'est stocké."
      >
        <input
          value={mt5DataPath}
          onChange={(event) => setMt5DataPath(event.target.value)}
          placeholder="C:\\Users\\...\\MetaQuotes\\Terminal"
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
