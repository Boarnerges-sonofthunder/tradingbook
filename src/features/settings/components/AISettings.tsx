import { useEffect, useState } from "react";
import { useNotification } from "../../../hooks";
import {
  DEFAULT_AI_PROVIDER_SETTINGS,
  getAIProviderSettings,
  resetAIProviderSettings,
  saveAIProviderSettings,
} from "../../../services/ai/aiSettingsService";
import type { AIProviderSettings } from "../../../services/ai/aiSettingsService";
import SettingsField from "./SettingsField";

export default function AISettings() {
  const notify = useNotification();
  const [settings, setSettings] = useState<AIProviderSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setSettings(await getAIProviderSettings());
      } catch {
        notify.error("Impossible de charger configuration IA");
      }
    }

    void load();
  }, [notify]);

  if (!settings) {
    return <p className="settings-empty">Chargement configuration IA…</p>;
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      await saveAIProviderSettings(settings);
      notify.success("Configuration IA enregistrée");
    } catch {
      notify.error("Impossible d'enregistrer configuration IA");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await resetAIProviderSettings();
      setSettings({ ...DEFAULT_AI_PROVIDER_SETTINGS });
      notify.info("Configuration IA réinitialisée");
    } catch {
      notify.error("Impossible de réinitialiser configuration IA");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <SettingsField
        label="Endpoint local"
        hint="URL serveur Ollama local (HTTP)."
      >
        <input
          value={settings.endpoint}
          onChange={(event) =>
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    endpoint: event.target.value,
                  }
                : prev,
            )
          }
          placeholder="http://127.0.0.1:11434/v1/chat/completions"
        />
      </SettingsField>

      <SettingsField
        label="Modèle"
        hint="Nom modèle exposé par endpoint local."
      >
        <input
          value={settings.model}
          onChange={(event) =>
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    model: event.target.value,
                  }
                : prev,
            )
          }
          placeholder="qwen2.5:7b"
        />
      </SettingsField>

      <SettingsField
        label="Timeout (ms)"
        hint="Délai max requête IA (2000 à 120000). Recommandé local qwen: 60000."
      >
        <input
          type="number"
          min="2000"
          max="120000"
          step="1000"
          value={settings.timeoutMs}
          onChange={(event) =>
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    timeoutMs: Number(event.target.value),
                  }
                : prev,
            )
          }
        />
      </SettingsField>

      <SettingsField
        label="Streaming réponses"
        hint="Active flux token par token si serveur supporte SSE/NDJSON."
      >
        <select
          value={String(settings.streamingEnabled)}
          onChange={(event) =>
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    streamingEnabled: event.target.value === "true",
                  }
                : prev,
            )
          }
        >
          <option value="true">Activé</option>
          <option value="false">Désactivé</option>
        </select>
      </SettingsField>

      <div className="settings-actions settings-actions--split">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void handleReset()}
          disabled={saving}
        >
          Valeurs par défaut
        </button>
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
