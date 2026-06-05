import { useEffect, useState } from "react";
import type { UserSettings } from "../../../types";
import { getSetting, setSetting } from "../../../services/settings/settingsService";
import SettingsField from "./SettingsField";

const MT5_TERMINAL_PATHS_SETTING_KEY = "mt5TerminalPaths";

interface MT5SettingsProps {
  settings: UserSettings;
  onSave: (settings: Partial<UserSettings>) => Promise<void>;
}

export default function MT5Settings({ settings, onSave }: MT5SettingsProps) {
  const [mt5AccountId, setMt5AccountId] = useState(settings.mt5AccountId ?? "");
  const [mt5DataPath, setMt5DataPath] = useState(settings.mt5DataPath ?? "");
  const [mt5TerminalPaths, setMt5TerminalPaths] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTerminalPaths() {
      const raw = await getSetting(MT5_TERMINAL_PATHS_SETTING_KEY);
      if (!cancelled) {
        setMt5TerminalPaths(raw ?? "");
      }
    }

    void loadTerminalPaths();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        mt5AccountId: mt5AccountId.trim() || null,
        mt5DataPath: mt5DataPath.trim() || null,
      });
      await setSetting(MT5_TERMINAL_PATHS_SETTING_KEY, mt5TerminalPaths.trim());
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

      <SettingsField
        label="Terminaux MT5 multiples"
        hint="Un chemin terminal par ligne. Utilisé pour lire plusieurs comptes/brokers en parallèle dans le dashboard."
      >
        <textarea
          value={mt5TerminalPaths}
          onChange={(event) => setMt5TerminalPaths(event.target.value)}
          placeholder={[
            "C:\\Program Files\\MetaTrader 5 - BrokerA\\terminal64.exe",
            "C:\\Program Files\\MetaTrader 5 - BrokerB\\terminal64.exe",
          ].join("\n")}
          rows={4}
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
