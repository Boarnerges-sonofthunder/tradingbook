import { useEffect, useState } from "react";
import { useNotification } from "../../../hooks";
import {
  clearAIMemoryState,
  DEFAULT_AI_PROVIDER_SETTINGS,
  getAIMemoryFilePath,
  getAIProviderSettings,
  loadAIMemoryState,
  resetAIProviderSettings,
  saveAIMemoryState,
  saveAIProviderSettings,
} from "../../../services/ai";
import type {
  AIMemoryFact,
  AIMemoryState,
  AIMemorySummary,
} from "../../../types";
import type { AIProviderSettings } from "../../../services/ai/aiSettingsService";
import SettingsField from "./SettingsField";

function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyFact(): AIMemoryFact {
  const now = new Date().toISOString();
  return {
    id: createLocalId("fact"),
    content: "",
    source: "user_preference",
    scopeKey: null,
    scopeLabel: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createEmptySummary(): AIMemorySummary {
  return {
    id: createLocalId("summary"),
    content: "",
    scopeKey: null,
    scopeLabel: null,
    createdAt: new Date().toISOString(),
  };
}

function withUpdatedFact(
  fact: AIMemoryFact,
  patch: Partial<AIMemoryFact>,
): AIMemoryFact {
  return {
    ...fact,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export default function AISettings() {
  const notify = useNotification();
  const [settings, setSettings] = useState<AIProviderSettings | null>(null);
  const [memory, setMemory] = useState<AIMemoryState | null>(null);
  const [memoryPath, setMemoryPath] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [providerSettings, memoryState, path] = await Promise.all([
          getAIProviderSettings(),
          loadAIMemoryState(),
          getAIMemoryFilePath(),
        ]);
        setSettings(providerSettings);
        setMemory(memoryState);
        setMemoryPath(path);
      } catch {
        notify.error("Impossible de charger configuration IA");
      }
    }

    void load();
  }, [notify]);

  if (!settings || !memory) {
    return <p className="settings-empty">Chargement configuration IA…</p>;
  }

  async function handleSaveConfig() {
    if (!settings) return;
    setSavingConfig(true);
    try {
      await saveAIProviderSettings(settings);
      notify.success("Configuration IA enregistrée");
    } catch {
      notify.error("Impossible d'enregistrer configuration IA");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleResetConfig() {
    setSavingConfig(true);
    try {
      await resetAIProviderSettings();
      setSettings({ ...DEFAULT_AI_PROVIDER_SETTINGS });
      notify.info("Configuration IA réinitialisée");
    } catch {
      notify.error("Impossible de réinitialiser configuration IA");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSaveMemory() {
    if (!memory) return;
    setSavingMemory(true);
    try {
      const sanitized: AIMemoryState = {
        facts: memory.facts
          .map((fact) => ({
            ...fact,
            content: fact.content.trim(),
            scopeLabel: fact.scopeLabel?.trim() || null,
            scopeKey: fact.scopeKey?.trim() || null,
          }))
          .filter((fact) => fact.content.length > 0),
        summaries: memory.summaries
          .map((summary) => ({
            ...summary,
            content: summary.content.trim(),
            scopeLabel: summary.scopeLabel?.trim() || null,
            scopeKey: summary.scopeKey?.trim() || null,
          }))
          .filter((summary) => summary.content.length > 0),
        updatedAt: new Date().toISOString(),
      };
      await saveAIMemoryState(sanitized);
      setMemory(sanitized);
      notify.success("Mémoire IA enregistrée");
    } catch {
      notify.error("Impossible d'enregistrer la mémoire IA");
    } finally {
      setSavingMemory(false);
    }
  }

  async function handleClearMemory() {
    setSavingMemory(true);
    try {
      const cleared = await clearAIMemoryState();
      setMemory(cleared);
      notify.info("Mémoire IA effacée");
    } catch {
      notify.error("Impossible d'effacer la mémoire IA");
    } finally {
      setSavingMemory(false);
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
          onClick={() => void handleResetConfig()}
          disabled={savingConfig}
        >
          Valeurs par défaut
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSaveConfig()}
          disabled={savingConfig}
        >
          {savingConfig ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      <div className="ai-memory-panel">
        <div className="ai-memory-panel__header">
          <div>
            <h3 className="ai-memory-panel__title">Mémoire locale IA</h3>
            <p className="settings-note">
              Locale uniquement. L’IA réutilise cette mémoire globale et les
              mémoires par compte, broker, symbole ou stratégie quand le
              contexte correspond.
            </p>
            <p className="settings-note">
              Fichier: <strong>{memoryPath}</strong>
            </p>
          </div>
          <div className="ai-memory-panel__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMemory((prev) =>
                  prev
                    ? { ...prev, facts: [createEmptyFact(), ...prev.facts] }
                    : prev,
                )
              }
              disabled={savingMemory}
            >
              Ajouter fait
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setMemory((prev) =>
                  prev
                    ? { ...prev, summaries: [createEmptySummary(), ...prev.summaries] }
                    : prev,
                )
              }
              disabled={savingMemory}
            >
              Ajouter résumé
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleClearMemory()}
              disabled={savingMemory}
            >
              Effacer mémoire IA
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSaveMemory()}
              disabled={savingMemory}
            >
              {savingMemory ? "Sauvegarde…" : "Sauvegarder mémoire"}
            </button>
          </div>
        </div>

        <div className="ai-memory-panel__grid">
          <div className="ai-memory-block">
            <h4 className="ai-memory-block__title">Faits durables</h4>
            {memory.facts.length === 0 ? (
              <p className="settings-empty">Aucun fait mémorisé.</p>
            ) : (
              <div className="ai-memory-list">
                {memory.facts.map((fact) => (
                  <div key={fact.id} className="ai-memory-item">
                    <div className="ai-memory-item__meta">
                      <span className="ai-memory-chip">{fact.source}</span>
                      <span className="ai-memory-chip ai-memory-chip--scope">
                        {fact.scopeLabel ?? "global"}
                      </span>
                    </div>
                    <textarea
                      className="ai-memory-item__textarea"
                      value={fact.content}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                facts: prev.facts.map((item) =>
                                  item.id === fact.id
                                    ? withUpdatedFact(item, {
                                        content: event.target.value,
                                      })
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      rows={3}
                    />
                    <input
                      className="ai-memory-item__input"
                      value={fact.scopeLabel ?? ""}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                facts: prev.facts.map((item) =>
                                  item.id === fact.id
                                    ? withUpdatedFact(item, {
                                        scopeLabel: event.target.value || null,
                                      })
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Scope lisible (ex: Compte FTMO / Symbole XAUUSD)"
                    />
                    <input
                      className="ai-memory-item__input"
                      value={fact.scopeKey ?? ""}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                facts: prev.facts.map((item) =>
                                  item.id === fact.id
                                    ? withUpdatedFact(item, {
                                        scopeKey: event.target.value || null,
                                      })
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Scope clé (ex: account:1 / symbol:XAUUSD)"
                    />
                    <div className="ai-memory-item__actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setMemory((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  facts: prev.facts.filter((item) => item.id !== fact.id),
                                }
                              : prev,
                          )
                        }
                        disabled={savingMemory}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ai-memory-block">
            <h4 className="ai-memory-block__title">Résumés persistants</h4>
            {memory.summaries.length === 0 ? (
              <p className="settings-empty">Aucun résumé mémorisé.</p>
            ) : (
              <div className="ai-memory-list">
                {memory.summaries.map((summary) => (
                  <div key={summary.id} className="ai-memory-item">
                    <div className="ai-memory-item__meta">
                      <span className="ai-memory-chip ai-memory-chip--scope">
                        {summary.scopeLabel ?? "global"}
                      </span>
                    </div>
                    <textarea
                      className="ai-memory-item__textarea"
                      value={summary.content}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                summaries: prev.summaries.map((item) =>
                                  item.id === summary.id
                                    ? {
                                        ...item,
                                        content: event.target.value,
                                      }
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      rows={4}
                    />
                    <input
                      className="ai-memory-item__input"
                      value={summary.scopeLabel ?? ""}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                summaries: prev.summaries.map((item) =>
                                  item.id === summary.id
                                    ? {
                                        ...item,
                                        scopeLabel: event.target.value || null,
                                      }
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Scope lisible"
                    />
                    <input
                      className="ai-memory-item__input"
                      value={summary.scopeKey ?? ""}
                      onChange={(event) =>
                        setMemory((prev) =>
                          prev
                            ? {
                                ...prev,
                                summaries: prev.summaries.map((item) =>
                                  item.id === summary.id
                                    ? {
                                        ...item,
                                        scopeKey: event.target.value || null,
                                      }
                                    : item,
                                ),
                              }
                            : prev,
                        )
                      }
                      placeholder="Scope clé"
                    />
                    <div className="ai-memory-item__actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setMemory((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  summaries: prev.summaries.filter(
                                    (item) => item.id !== summary.id,
                                  ),
                                }
                              : prev,
                          )
                        }
                        disabled={savingMemory}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
