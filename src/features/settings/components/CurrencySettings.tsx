import { useState } from "react";
import {
  SUPPORTED_DISPLAY_CURRENCIES,
  type DisplayCurrencyCode,
  type UserSettings,
} from "../../../types";
import SettingsField from "./SettingsField";

interface CurrencySettingsProps {
  settings: UserSettings;
  onSave: (settings: Partial<UserSettings>) => Promise<void>;
}

export default function CurrencySettings({
  settings,
  onSave,
}: CurrencySettingsProps) {
  const [currency, setCurrency] = useState<DisplayCurrencyCode>(
    settings.defaultCurrency,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ defaultCurrency: currency });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <SettingsField
        label="Devise d'affichage"
        hint="Format visuel applique aux montants dans TradingBook. Aucun montant n'est converti automatiquement."
      >
        <select
          value={currency}
          onChange={(event) =>
            setCurrency(event.target.value as DisplayCurrencyCode)
          }
        >
          {SUPPORTED_DISPLAY_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </SettingsField>

      <SettingsField
        label="Comportement"
        hint="La devise choisie est memorisee dans SQLite et reappliquee apres redemarrage."
      >
        <input
          value="Affichage uniquement - pas de conversion FX automatique"
          readOnly
        />
      </SettingsField>

      <div className="settings-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
