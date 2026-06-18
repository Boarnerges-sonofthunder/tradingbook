import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Power, Trash2, Wallet } from "lucide-react";
import type { Broker, TradingAccount, TradingAccountFormData } from "../types";
import {
  createTradingAccount,
  deactivateTradingAccount,
  deleteTradingAccount,
  getTradingAccounts,
  updateTradingAccount,
} from "../services/tradingAccounts/tradingAccountsService";
import { getBrokers } from "../services/brokers/brokersService";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useNotification, useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";
import { ValidationError } from "../validation";

const EMPTY_FORM: TradingAccountFormData = {
  name: "",
  broker: "",
  platform: "mt5",
  accountNumber: "",
  accountType: "other",
  currency: "USD",
  initialCapital: null,
  isActive: true,
};

function formatCapital(value: number | null, currency: string | null): string {
  if (value === null) return "-";
  const amount = value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${amount} ${currency}` : amount;
}

interface AccountFormModalProps {
  mode: "create" | "edit";
  language: "fr" | "en";
  value: TradingAccountFormData;
  brokers: Broker[];
  saving: boolean;
  errors: string[];
  onChange: (
    field: keyof TradingAccountFormData,
    value: string | boolean | number | null,
  ) => void;
  onSave: () => void;
  onClose: () => void;
}

function AccountFormModal({
  mode,
  language,
  value,
  brokers,
  saving,
  errors,
  onChange,
  onSave,
  onClose,
}: AccountFormModalProps) {
  const title =
    mode === "create"
      ? tr(language, "Nouveau compte trading", "New trading account")
      : tr(language, "Modifier le compte", "Edit account");

  return (
    <div
      className="confirm-dialog-backdrop"
      role="dialog"
      aria-modal
      aria-labelledby="account-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="strategy-form-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__header">
          <h2 className="confirm-dialog__title" id="account-modal-title">
            {title}
          </h2>
        </div>

        {errors.length > 0 && (
          <ul className="strategy-form-errors" role="alert">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}

        <div className="strategy-form-body">
          <div className="form-grid form-grid--2">
            <label className="form-group">
              <span className="form-label">
                {tr(language, "Nom du compte", "Account name")}
              </span>
              <input
                value={value.name}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder="Fusion Markets Live"
                disabled={saving}
                autoFocus
              />
            </label>

            <label className="form-group">
              <span className="form-label">Broker</span>
              <input
                value={value.broker}
                list="accounts-broker-list"
                onChange={(event) => {
                  const nextName = event.target.value;
                  const matched = brokers.find(
                    (broker) =>
                      broker.name.trim().toLowerCase() ===
                      nextName.trim().toLowerCase(),
                  );
                  onChange("broker", nextName);
                  onChange("brokerId", matched?.id ?? null);
                }}
                placeholder="Fusion Markets"
                disabled={saving}
              />
              <datalist id="accounts-broker-list">
                {brokers.map((broker) => (
                  <option key={broker.id} value={broker.name} />
                ))}
              </datalist>
            </label>

            <label className="form-group">
              <span className="form-label">
                {tr(language, "Plateforme", "Platform")}
              </span>
              <select
                value={value.platform}
                onChange={(event) => onChange("platform", event.target.value)}
                disabled={saving}
              >
                <option value="mt5">MT5</option>
                <option value="mt4">MT4</option>
                <option value="csv">CSV</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">
                {tr(language, "Numéro de compte", "Account number")}
              </span>
              <input
                value={value.accountNumber}
                onChange={(event) =>
                  onChange("accountNumber", event.target.value)
                }
                placeholder="12345678"
                disabled={saving}
              />
            </label>

            <label className="form-group">
              <span className="form-label">
                {tr(language, "Type de compte", "Account type")}
              </span>
              <select
                value={value.accountType ?? "other"}
                onChange={(event) =>
                  onChange("accountType", event.target.value)
                }
                disabled={saving}
              >
                <option value="live">Live</option>
                <option value="demo">Demo</option>
                <option value="prop">Prop</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="form-group">
              <span className="form-label">
                {tr(language, "Devise", "Currency")}
              </span>
              <input
                value={value.currency ?? ""}
                onChange={(event) =>
                  onChange("currency", event.target.value.toUpperCase())
                }
                placeholder="USD"
                disabled={saving}
              />
            </label>

            <label className="form-group">
              <span className="form-label">
                {tr(language, "Capital initial", "Initial capital")}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={value.initialCapital ?? ""}
                onChange={(event) =>
                  onChange(
                    "initialCapital",
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
                placeholder="10000"
                disabled={saving}
              />
            </label>
          </div>

          <label className="form-group strategy-form__toggle-row">
            <input
              type="checkbox"
              className="strategy-form__checkbox"
              checked={value.isActive !== false}
              onChange={(event) => onChange("isActive", event.target.checked)}
              disabled={saving}
            />
            <span className="strategy-form__toggle-label">
              {tr(language, "Compte actif", "Active account")}
            </span>
          </label>
        </div>

        <div className="confirm-dialog__footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            {tr(language, "Annuler", "Cancel")}
          </button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving
              ? tr(language, "Enregistrement...", "Saving...")
              : mode === "create"
                ? tr(language, "Créer le compte", "Create account")
                : tr(language, "Enregistrer", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const notify = useNotification();
  const settings = useUserSettings();
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed");
  const [target, setTarget] = useState<TradingAccount | null>(null);
  const [formData, setFormData] = useState<TradingAccountFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [deactivateTarget, setDeactivateTarget] =
    useState<TradingAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TradingAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setHasLoadError(false);
    try {
      setAccounts(await getTradingAccounts(false));
    } catch {
      setHasLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrokers() {
      try {
        const rows = await getBrokers(true);
        if (!cancelled) setBrokers(rows);
      } catch {
        if (!cancelled) setBrokers([]);
      }
    }
    void loadBrokers();
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreate() {
    setErrors([]);
    setTarget(null);
    setFormData(EMPTY_FORM);
    setMode("create");
  }

  function openEdit(account: TradingAccount) {
    setErrors([]);
    setTarget(account);
      setFormData({
        name: account.name,
        broker: account.broker,
        brokerId: account.brokerId ?? null,
        platform: account.platform,
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        currency: account.currency,
        initialCapital: account.initialCapital,
        isActive: account.isActive,
      });
    setMode("edit");
  }

  async function saveForm() {
    setSaving(true);
    setErrors([]);
    try {
      const matchedBroker = brokers.find(
        (broker) =>
          broker.name.trim().toLowerCase() ===
          formData.broker.trim().toLowerCase(),
      );
      const payload: TradingAccountFormData = {
        ...formData,
        brokerId: formData.brokerId ?? matchedBroker?.id ?? null,
      };
      if (mode === "create") {
        await createTradingAccount(payload);
        notify.success(tr(settings.language, "Compte créé", "Account created"));
      } else if (mode === "edit" && target) {
        await updateTradingAccount(target.id, payload);
        notify.success(
          tr(settings.language, "Compte mis à jour", "Account updated"),
        );
      }
      setMode("closed");
      await loadAccounts();
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.issues);
      } else {
        setErrors([
          tr(
            settings.language,
            "Erreur lors de l'enregistrement du compte",
            "Error while saving account",
          ),
        ]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await deactivateTradingAccount(deactivateTarget.id);
      notify.info(
        tr(
          settings.language,
          "Compte désactivé. Les trades restent conservés.",
          "Account disabled. Trades remain preserved.",
        ),
      );
      setDeactivateTarget(null);
      await loadAccounts();
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de désactiver le compte",
          "Unable to disable account",
        ),
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteTradingAccount(deleteTarget.id);
      notify.success(
        tr(settings.language, "Compte supprimé", "Account deleted"),
      );
      setDeleteTarget(null);
      await loadAccounts();
    } catch (error) {
      if (error instanceof ValidationError) {
        notify.error(error.issues[0]);
      } else {
        notify.error(
          tr(
            settings.language,
            "Impossible de supprimer le compte",
            "Unable to delete account",
          ),
        );
      }
    }
  }

  return (
    <div className="content-max">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            {tr(settings.language, "Comptes de trading", "Trading accounts")}
          </h1>
          <p className="page-subtitle">
            {tr(
              settings.language,
              "Gérez vos comptes multi-broker/multi-plateforme. La désactivation ne supprime jamais les trades.",
              "Manage your multi-broker/multi-platform accounts. Disabling never deletes trades.",
            )}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary btn-icon-text" onClick={openCreate}>
            <Plus size={14} aria-hidden />
            {tr(settings.language, "Nouveau compte", "New account")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="page-loading">
          {tr(
            settings.language,
            "Chargement des comptes...",
            "Loading accounts...",
          )}
        </p>
      ) : hasLoadError ? (
        <div
          role="status"
          style={{
            height: "44px",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-alt)",
            display: "flex",
            alignItems: "center",
            padding: "0 var(--spacing-md)",
            color: "var(--color-text-muted)",
          }}
        >
          {tr(
            settings.language,
            "Veuillez ajouter un compte",
            "Please add an account",
          )}
        </div>
      ) : accounts.length === 0 ? (
        <div className="trades-empty">
          <p className="trades-empty__title">
            {tr(
              settings.language,
              "Aucun compte configuré",
              "No account configured",
            )}
          </p>
          <p className="trades-empty__hint">
            {tr(
              settings.language,
              "Créez un compte pour relier vos imports CSV et synchronisations MT5/MT4.",
              "Create an account to link your CSV imports and MT5/MT4 sync.",
            )}
          </p>
          <button className="btn-secondary" onClick={openCreate}>
            {tr(settings.language, "Créer un compte", "Create account")}
          </button>
        </div>
      ) : (
        <div className="strategy-grid">
          {accounts.map((account) => (
            <article key={account.id} className="strategy-card card">
              <div className="strategy-card__header">
                <div className="strategy-card__title-row">
                  <h2 className="strategy-card__name">{account.name}</h2>
                  <span
                    className={`badge ${account.isActive ? "badge-positive" : "badge-neutral"}`}
                  >
                    {account.isActive
                      ? tr(settings.language, "Actif", "Active")
                      : tr(settings.language, "Inactif", "Inactive")}
                  </span>
                </div>
                <div className="strategy-card__actions">
                  <button
                    className="btn-ghost strategy-card__action-btn"
                    onClick={() => openEdit(account)}
                    title={tr(settings.language, "Modifier", "Edit")}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    className="btn-ghost strategy-card__action-btn"
                    onClick={() => setDeactivateTarget(account)}
                    title={tr(settings.language, "Désactiver", "Disable")}
                    disabled={!account.isActive}
                  >
                    <Power size={14} aria-hidden />
                  </button>
                  <button
                    className="btn-ghost strategy-card__action-btn strategy-card__action-btn--danger"
                    onClick={() => setDeleteTarget(account)}
                    title={tr(settings.language, "Supprimer", "Delete")}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">
                  {tr(
                    settings.language,
                    "Broker / Plateforme :",
                    "Broker / Platform:",
                  )}
                </span>
                <span className="strategy-card__rules-text">
                  {account.broker} · {account.platform.toUpperCase()}
                </span>
              </div>
              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">
                  {tr(settings.language, "Compte :", "Account:")}
                </span>
                <span className="strategy-card__rules-text">
                  {account.accountNumber} ({account.accountType})
                </span>
              </div>
              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">
                  {tr(settings.language, "Devise :", "Currency:")}
                </span>
                <span className="strategy-card__rules-text">
                  {account.currency ?? "-"}
                </span>
              </div>
              <div className="strategy-card__rules-block">
                <span className="strategy-card__rules-label">
                  {tr(settings.language, "Capital initial :", "Initial capital:")}
                </span>
                <span className="strategy-card__rules-text">
                  {formatCapital(account.initialCapital, account.currency)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {mode !== "closed" && (
        <AccountFormModal
          mode={mode}
          language={settings.language}
          value={formData}
          brokers={brokers}
          saving={saving}
          errors={errors}
          onChange={(field, value) =>
            setFormData((current) => ({ ...current, [field]: value as never }))
          }
          onSave={() => {
            void saveForm();
          }}
          onClose={() => setMode("closed")}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deactivateTarget)}
        title={tr(
          settings.language,
          "Désactiver ce compte ?",
          "Disable this account?",
        )}
        message={
          deactivateTarget
            ? tr(
                settings.language,
                `Le compte ${deactivateTarget.name} sera masqué pour les nouveaux imports/syncs, mais ses trades resteront visibles.`,
                `Account ${deactivateTarget.name} will be hidden for new imports/syncs, but its trades will remain visible.`,
              )
            : ""
        }
        confirmLabel={tr(settings.language, "Désactiver", "Disable")}
        cancelLabel={tr(settings.language, "Annuler", "Cancel")}
        onConfirm={() => {
          void confirmDeactivate();
        }}
        onCancel={() => setDeactivateTarget(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={tr(
          settings.language,
          "Supprimer ce compte ?",
          "Delete this account?",
        )}
        message={
          deleteTarget
            ? tr(
                settings.language,
                `Suppression définitive du compte ${deleteTarget.name}. Refusée automatiquement si des trades sont liés.`,
                `Permanent deletion of account ${deleteTarget.name}. Automatically blocked if trades are linked.`,
              )
            : ""
        }
        confirmLabel={tr(settings.language, "Supprimer", "Delete")}
        cancelLabel={tr(settings.language, "Annuler", "Cancel")}
        danger
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <div
        className="card"
        style={{
          marginTop: "var(--spacing-lg)",
          display: "flex",
          gap: "var(--spacing-md)",
          alignItems: "flex-start",
        }}
      >
        <Wallet size={18} aria-hidden style={{ marginTop: "2px" }} />
        <p>
          {tr(
            settings.language,
            "Les comptes désactivés ne sont plus proposés dans les imports/syncs, mais les trades existants ne sont jamais supprimés.",
            "Disabled accounts are no longer proposed in imports/syncs, but existing trades are never deleted.",
          )}
        </p>
      </div>
    </div>
  );
}
