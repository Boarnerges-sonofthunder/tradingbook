import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { useNotification } from "../../../hooks";
import type {
  Broker,
  BrokerFormData,
  BrokerType,
  TradePlatform,
} from "../../../types";
import {
  createBroker,
  deactivateBroker,
  getBrokers,
  updateBroker,
} from "../../../services/brokers/brokersService";
import { ValidationError } from "../../../validation";

const PLATFORM_OPTIONS: TradePlatform[] = ["mt5", "mt4", "csv", "manual"];

const BROKER_TYPE_OPTIONS: Array<{ value: BrokerType; label: string }> = [
  { value: "retail", label: "Retail" },
  { value: "prop", label: "Prop" },
  { value: "institutional", label: "Institutional" },
  { value: "csv", label: "CSV" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM: BrokerFormData = {
  name: "",
  brokerType: "retail",
  platformSupported: ["mt5", "mt4", "csv"],
  website: "",
  isActive: true,
};

export default function BrokersSettings() {
  const notify = useNotification();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<BrokerFormData>(EMPTY_FORM);

  const sortedBrokers = useMemo(
    () =>
      [...brokers].sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          a.name.localeCompare(b.name),
      ),
    [brokers],
  );

  const loadBrokers = useCallback(async () => {
    setLoading(true);
    try {
      setBrokers(await getBrokers(false));
    } catch {
      notify.error("Impossible de charger les brokers");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadBrokers();
  }, [loadBrokers]);

  function togglePlatform(platform: TradePlatform): void {
    setForm((current) => {
      const existing = current.platformSupported ?? [];
      const next = existing.includes(platform)
        ? existing.filter((item) => item !== platform)
        : [...existing, platform];
      return { ...current, platformSupported: next };
    });
  }

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors([]);
  }

  function startEdit(broker: Broker): void {
    setEditingId(broker.id);
    setErrors([]);
    setForm({
      name: broker.name,
      brokerType: broker.brokerType,
      platformSupported: broker.platformSupported,
      website: broker.website ?? "",
      isActive: broker.isActive,
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setErrors([]);
    try {
      const payload: BrokerFormData = {
        ...form,
        website: form.website?.trim() ? form.website.trim() : null,
      };

      if (editingId === null) {
        await createBroker(payload);
        notify.success("Broker créé");
      } else {
        await updateBroker(editingId, payload);
        notify.success("Broker mis à jour");
      }

      resetForm();
      await loadBrokers();
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.issues);
      } else {
        setErrors(["Erreur pendant l'enregistrement du broker"]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: number): Promise<void> {
    try {
      await deactivateBroker(id);
      notify.info("Broker désactivé");
      await loadBrokers();
    } catch {
      notify.error("Impossible de désactiver le broker");
    }
  }

  return (
    <div className="settings-grid">
      <div className="form-grid form-grid--2" style={{ width: "100%" }}>
        <label className="form-group">
          <span className="form-label">Nom</span>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Fusion Markets"
            disabled={saving}
          />
        </label>

        <label className="form-group">
          <span className="form-label">Type</span>
          <select
            value={form.brokerType ?? "retail"}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                brokerType: event.target.value as BrokerType,
              }))
            }
            disabled={saving}
          >
            {BROKER_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-group" style={{ gridColumn: "1 / -1" }}>
          <span className="form-label">Site web</span>
          <input
            value={form.website ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                website: event.target.value,
              }))
            }
            placeholder="https://broker.com"
            disabled={saving}
          />
        </label>

        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <span className="form-label">Plateformes supportées</span>
          <div
            style={{
              display: "flex",
              gap: "var(--spacing-md)",
              flexWrap: "wrap",
            }}
          >
            {PLATFORM_OPTIONS.map((platform) => {
              const checked = (form.platformSupported ?? []).includes(platform);
              return (
                <label
                  key={platform}
                  className="strategy-form__toggle-row"
                  style={{ marginBottom: 0 }}
                >
                  <input
                    type="checkbox"
                    className="strategy-form__checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(platform)}
                    disabled={saving}
                  />
                  <span className="strategy-form__toggle-label">
                    {platform.toUpperCase()}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="strategy-form-errors" role="alert">
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}

      <div
        className="settings-actions"
        style={{ display: "flex", gap: "var(--spacing-sm)" }}
      >
        <button
          type="button"
          className="btn-primary btn-icon-text"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {editingId === null ? (
            <Plus size={14} aria-hidden />
          ) : (
            <Pencil size={14} aria-hidden />
          )}
          {saving
            ? "Enregistrement…"
            : editingId === null
              ? "Créer broker"
              : "Mettre à jour"}
        </button>
        {editingId !== null && (
          <button
            type="button"
            className="btn-secondary"
            onClick={resetForm}
            disabled={saving}
          >
            Annuler
          </button>
        )}
      </div>

      {loading ? (
        <p className="settings-empty">Chargement des brokers…</p>
      ) : sortedBrokers.length === 0 ? (
        <p className="settings-empty">Aucun broker configuré.</p>
      ) : (
        <div className="strategy-grid" style={{ width: "100%" }}>
          {sortedBrokers.map((broker) => (
            <article key={broker.id} className="strategy-card card">
              <div className="strategy-card__header">
                <div className="strategy-card__title-row">
                  <h3 className="strategy-card__name">{broker.name}</h3>
                  <span
                    className={`badge ${broker.isActive ? "badge-positive" : "badge-neutral"}`}
                  >
                    {broker.isActive ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="strategy-card__actions">
                  <button
                    className="btn-ghost strategy-card__action-btn"
                    onClick={() => startEdit(broker)}
                    title="Modifier"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    className="btn-ghost strategy-card__action-btn"
                    onClick={() => void handleDeactivate(broker.id)}
                    title="Désactiver"
                    disabled={!broker.isActive}
                  >
                    <Power size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">Type :</span>
                <span className="strategy-card__rules-text">
                  {broker.brokerType}
                </span>
              </div>
              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">
                  Plateformes :
                </span>
                <span className="strategy-card__rules-text">
                  {broker.platformSupported
                    .map((platform) => platform.toUpperCase())
                    .join(", ")}
                </span>
              </div>
              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">Site :</span>
                <span className="strategy-card__rules-text">
                  {broker.website ?? "-"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
