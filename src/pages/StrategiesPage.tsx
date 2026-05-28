// ============================================================
// StrategiesPage — Gestion des stratégies / playbooks
// ============================================================
// Fonctionnalités :
//   - Liste toutes les stratégies (actives en premier, tri alphabétique)
//   - Créer une nouvelle stratégie via une modal
//   - Modifier une stratégie existante (modal préremplie)
//   - Supprimer avec confirmation (les trades conservent strategy_id = NULL)
//   - Badge "Actif / Inactif" sur chaque carte
//
// Architecture :
//   StrategiesPage (gestion d'état + coordination)
//     ├── Grille de StrategyCard (lecture)
//     ├── StrategyFormModal (créer / modifier)
//     └── ConfirmDialog (supprimer)
//
// Services utilisés :
//   - strategiesService.getStrategies()     → lire toutes
//   - strategiesService.createStrategy()    → créer + valider Zod
//   - strategiesService.updateStrategy()    → modifier + valider Zod
//   - strategiesService.deleteStrategy()    → supprimer
//     ↳ ON DELETE SET NULL sur trades.strategy_id : les trades sont conservés
//
// Règles métier :
//   - Nom unique (contrainte UNIQUE en base)
//   - Description et règles optionnelles
//   - isActive permet de masquer une stratégie obsolète sans la supprimer
//   - Une stratégie inactive n'apparaît plus dans les nouveaux trades
//     mais reste visible ici pour consultation/modification
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import type { Strategy, StrategyFormData } from "../types";
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
} from "../services/strategies/strategiesService";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useNotification, useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";
import { ValidationError } from "../validation";

// ─── Helpers ─────────────────────────────────────────────

function formatDate(iso: string, language: "fr" | "en"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(language === "fr" ? "fr-FR" : "en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Tronque un texte long avec une ellipse. */
function truncate(text: string | null, max = 120): string {
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max).trimEnd() + "…";
}

// ─── Valeurs initiales du formulaire ─────────────────────

const EMPTY_FORM: StrategyFormData = {
  name: "",
  description: "",
  rules: "",
  isActive: true,
};

// ─── Composant : carte d'une stratégie ───────────────────

interface StrategyCardProps {
  language: "fr" | "en";
  strategy: Strategy;
  onEdit: (s: Strategy) => void;
  onDelete: (s: Strategy) => void;
}

function StrategyCard({
  language,
  strategy,
  onEdit,
  onDelete,
}: StrategyCardProps) {
  return (
    <article
      className="strategy-card card"
      aria-label={`${tr(language, "Stratégie", "Strategy")} ${strategy.name}`}
    >
      {/* ── En-tête : nom + badges + actions ── */}
      <div className="strategy-card__header">
        <div className="strategy-card__title-row">
          <h2 className="strategy-card__name">{strategy.name}</h2>
          <span
            className={`badge ${strategy.isActive ? "badge-positive" : "badge-neutral"}`}
          >
            {strategy.isActive
              ? tr(language, "Actif", "Active")
              : tr(language, "Inactif", "Inactive")}
          </span>
        </div>
        <div className="strategy-card__actions">
          <button
            type="button"
            className="btn-ghost strategy-card__action-btn"
            onClick={() => onEdit(strategy)}
            aria-label={`${tr(language, "Modifier la stratégie", "Edit strategy")} ${strategy.name}`}
            title={tr(language, "Modifier", "Edit")}
          >
            <Pencil size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="btn-ghost strategy-card__action-btn strategy-card__action-btn--danger"
            onClick={() => onDelete(strategy)}
            aria-label={`${tr(language, "Supprimer la stratégie", "Delete strategy")} ${strategy.name}`}
            title={tr(language, "Supprimer", "Delete")}
          >
            <Trash2 size={14} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Description ── */}
      {strategy.description && (
        <p className="strategy-card__desc">
          {truncate(strategy.description, 160)}
        </p>
      )}

      {/* ── Règles (extrait) ── */}
      {strategy.rules && (
        <div className="strategy-card__rules-block">
          <span className="strategy-card__rules-label">
            {tr(language, "Règles :", "Rules:")}
          </span>
          <span className="strategy-card__rules-text">
            {truncate(strategy.rules, 200)}
          </span>
        </div>
      )}

      {/* ── Pied de carte ── */}
      <p className="strategy-card__date">
        {tr(language, "Créée le", "Created on")}{" "}
        {formatDate(strategy.createdAt, language)}
      </p>
    </article>
  );
}

// ─── Composant : modal du formulaire ─────────────────────

interface StrategyFormModalProps {
  mode: "create" | "edit";
  language: "fr" | "en";
  /** Données initiales (mode édition). */
  initial: StrategyFormData;
  saving: boolean;
  errors: string[];
  onChange: (field: keyof StrategyFormData, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

function StrategyFormModal({
  mode,
  language,
  initial,
  saving,
  errors,
  onChange,
  onSave,
  onCancel,
}: StrategyFormModalProps) {
  const title =
    mode === "create"
      ? tr(language, "Nouvelle stratégie", "New strategy")
      : tr(language, "Modifier la stratégie", "Edit strategy");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    // Fond semi-transparent bloquant (réutilise .confirm-dialog-backdrop)
    <div
      className="confirm-dialog-backdrop"
      role="dialog"
      aria-modal
      aria-labelledby="strategy-modal-title"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        // Clic sur le fond ferme la modal (sauf si en cours de sauvegarde)
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="strategy-form-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="confirm-dialog__header">
          <h2 className="confirm-dialog__title" id="strategy-modal-title">
            {title}
          </h2>
        </div>

        {/* Erreurs de validation */}
        {errors.length > 0 && (
          <ul className="strategy-form-errors" role="alert" aria-live="polite">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        {/* Corps du formulaire */}
        <div className="strategy-form-body">
          {/* Nom */}
          <div className="form-group">
            <label className="form-label" htmlFor="st-name">
              {tr(language, "Nom", "Name")}{" "}
              <span className="form-required">*</span>
            </label>
            <input
              id="st-name"
              type="text"
              value={initial.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder={tr(
                language,
                "Ex : Breakout, Pullback, Liquidity sweep…",
                "Ex: Breakout, Pullback, Liquidity sweep...",
              )}
              maxLength={100}
              disabled={saving}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="st-desc">
              {tr(language, "Description", "Description")}{" "}
              <span className="form-label-optional">
                {tr(language, "(optionnelle)", "(optional)")}
              </span>
            </label>
            <textarea
              id="st-desc"
              value={initial.description ?? ""}
              onChange={(e) => onChange("description", e.target.value)}
              placeholder={tr(
                language,
                "Résumé court de la stratégie…",
                "Short strategy summary...",
              )}
              maxLength={500}
              rows={2}
              disabled={saving}
            />
            <span className="form-hint">
              {(initial.description ?? "").length} / 500{" "}
              {tr(language, "car.", "chars.")}
            </span>
          </div>

          {/* Règles */}
          <div className="form-group">
            <label className="form-label" htmlFor="st-rules">
              {tr(language, "Règles / Playbook", "Rules / Playbook")}{" "}
              <span className="form-label-optional">
                {tr(language, "(optionnel)", "(optional)")}
              </span>
            </label>
            <textarea
              id="st-rules"
              value={initial.rules ?? ""}
              onChange={(e) => onChange("rules", e.target.value)}
              placeholder={tr(
                language,
                "Décrivez les conditions d'entrée, sortie, contexte…\n- Signal requis :\n- Confirmation :\n- Stop loss :\n- Target :",
                "Describe entry/exit/context conditions...\n- Required signal:\n- Confirmation:\n- Stop loss:\n- Target:",
              )}
              maxLength={5000}
              rows={6}
              disabled={saving}
              className="strategy-form__rules-textarea"
            />
            <span className="form-hint">
              {(initial.rules ?? "").length} / 5000{" "}
              {tr(language, "car.", "chars.")}
            </span>
          </div>

          {/* Statut actif */}
          <div className="form-group strategy-form__toggle-row">
            <input
              id="st-active"
              type="checkbox"
              checked={initial.isActive !== false}
              onChange={(e) => onChange("isActive", e.target.checked)}
              disabled={saving}
              className="strategy-form__checkbox"
            />
            <label htmlFor="st-active" className="strategy-form__toggle-label">
              {tr(language, "Stratégie active", "Active strategy")}
              <span className="form-hint">
                {initial.isActive !== false
                  ? tr(
                      language,
                      "Visible dans les nouveaux trades",
                      "Visible in new trades",
                    )
                  : tr(
                      language,
                      "Masquée dans les nouveaux trades (reste consultable ici)",
                      "Hidden in new trades (still visible here)",
                    )}
              </span>
            </label>
          </div>
        </div>

        {/* Pied : actions */}
        <div className="confirm-dialog__footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            {tr(language, "Annuler", "Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving
              ? tr(language, "Enregistrement…", "Saving...")
              : mode === "create"
                ? tr(language, "Créer la stratégie", "Create strategy")
                : tr(language, "Enregistrer", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────

export default function StrategiesPage() {
  const notify = useNotification();
  const settings = useUserSettings();

  // ── État ─────────────────────────────────────────────

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  /** Mode d'affichage de la modal : fermée / création / édition */
  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">(
    "closed",
  );
  /** Stratégie en cours d'édition (null en mode création). */
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);
  /** Champs du formulaire en cours. */
  const [formData, setFormData] = useState<StrategyFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  /** Stratégie ciblée par la suppression (null = pas de dialog ouvert). */
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Chargement ────────────────────────────────────────

  const loadStrategies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStrategies();
      setStrategies(data);
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de charger les stratégies",
          "Unable to load strategies",
        ),
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  // ── Ouverture de la modal ──────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setFormData({ ...EMPTY_FORM });
    setFormErrors([]);
    setFormMode("create");
  }

  function openEdit(strategy: Strategy) {
    setEditTarget(strategy);
    setFormData({
      name: strategy.name,
      description: strategy.description ?? "",
      rules: strategy.rules ?? "",
      isActive: strategy.isActive,
    });
    setFormErrors([]);
    setFormMode("edit");
  }

  function closeModal() {
    setFormMode("closed");
  }

  // ── Modification d'un champ du formulaire ─────────────

  function handleFormChange(
    field: keyof StrategyFormData,
    value: string | boolean,
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Effacer les erreurs dès que l'utilisateur saisit
    if (formErrors.length > 0) setFormErrors([]);
  }

  // ── Sauvegarde (créer ou mettre à jour) ───────────────

  async function handleSave() {
    setSaving(true);
    setFormErrors([]);
    try {
      // Normalisation
      const payload: StrategyFormData = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        rules: formData.rules?.trim() || null,
        isActive: formData.isActive !== false,
      };

      if (formMode === "create") {
        const created = await createStrategy(payload);
        setStrategies((prev) =>
          [created, ...prev].sort((a, b) => {
            // Actives en premier, puis alphabétique
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return a.name.localeCompare(b.name, "fr");
          }),
        );
        notify.success(
          tr(
            settings.language,
            `Stratégie "${created.name}" créée`,
            `Strategy "${created.name}" created`,
          ),
        );
      } else if (formMode === "edit" && editTarget) {
        const updated = await updateStrategy(editTarget.id, payload);
        if (updated) {
          setStrategies((prev) =>
            prev
              .map((s) => (s.id === updated.id ? updated : s))
              .sort((a, b) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                return a.name.localeCompare(b.name, "fr");
              }),
          );
          notify.success(
            tr(
              settings.language,
              `Stratégie "${updated.name}" mise à jour`,
              `Strategy "${updated.name}" updated`,
            ),
          );
        }
      }
      closeModal();
    } catch (err) {
      if (err instanceof ValidationError) {
        setFormErrors(err.issues);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        // Contrainte UNIQUE : message SQLite contient "UNIQUE constraint failed"
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
          setFormErrors([
            tr(
              settings.language,
              "Une stratégie avec ce nom existe déjà",
              "A strategy with this name already exists",
            ),
          ]);
        } else {
          setFormErrors([
            tr(
              settings.language,
              `Impossible d'enregistrer : ${msg}`,
              `Unable to save: ${msg}`,
            ),
          ]);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Suppression ───────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteStrategy(deleteTarget.id);
      setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      notify.success(
        tr(
          settings.language,
          `Stratégie "${deleteTarget.name}" supprimée`,
          `Strategy "${deleteTarget.name}" deleted`,
        ),
      );
      setDeleteTarget(null);
    } catch {
      notify.error(
        tr(
          settings.language,
          "Impossible de supprimer la stratégie",
          "Unable to delete strategy",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  // ── Compteurs ─────────────────────────────────────────

  const activeCount = strategies.filter((s) => s.isActive).length;
  const inactiveCount = strategies.length - activeCount;

  // ── JSX ───────────────────────────────────────────────

  return (
    <div className="content-max">
      {/* ── En-tête de page ──────────────────────────── */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">
            {tr(
              settings.language,
              "Stratégies & Playbooks",
              "Strategies & playbooks",
            )}
          </h1>
          <p className="page-subtitle">
            {loading
              ? tr(settings.language, "Chargement…", "Loading...")
              : strategies.length === 0
                ? tr(
                    settings.language,
                    "Aucune stratégie créée",
                    "No strategy created",
                  )
                : settings.language === "fr"
                  ? `${strategies.length} stratégie${strategies.length !== 1 ? "s" : ""} — ${activeCount} active${activeCount !== 1 ? "s" : ""}${inactiveCount > 0 ? `, ${inactiveCount} inactive${inactiveCount !== 1 ? "s" : ""}` : ""}`
                  : `${strategies.length} strateg${strategies.length !== 1 ? "ies" : "y"} — ${activeCount} active${activeCount !== 1 ? "s" : ""}${inactiveCount > 0 ? `, ${inactiveCount} inactive${inactiveCount !== 1 ? "s" : ""}` : ""}`}
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-primary btn-icon-text"
            onClick={openCreate}
            aria-label={tr(
              settings.language,
              "Créer une nouvelle stratégie",
              "Create a new strategy",
            )}
          >
            <Plus size={14} aria-hidden />
            {tr(settings.language, "Nouvelle stratégie", "New strategy")}
          </button>
        </div>
      </div>

      {/* ── Contenu ──────────────────────────────────── */}
      {loading ? (
        <p className="page-loading">
          {tr(
            settings.language,
            "Chargement des stratégies…",
            "Loading strategies...",
          )}
        </p>
      ) : strategies.length === 0 ? (
        /* État vide */
        <div className="strategies-empty">
          <BookOpen size={40} className="strategies-empty__icon" aria-hidden />
          <p className="strategies-empty__title">
            {tr(
              settings.language,
              "Aucune stratégie créée",
              "No strategy created",
            )}
          </p>
          <p className="strategies-empty__hint">
            {tr(
              settings.language,
              "Créez vos playbooks pour classifier vos trades et analyser vos performances par setup.",
              "Create your playbooks to classify trades and analyze performance by setup.",
            )}
          </p>
          <p className="strategies-empty__hint">
            {tr(
              settings.language,
              "Exemples : Breakout, Pullback, Reversal, Liquidity sweep, Trend continuation…",
              "Examples: Breakout, Pullback, Reversal, Liquidity sweep, Trend continuation...",
            )}
          </p>
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={openCreate}
          >
            <Plus size={14} aria-hidden />
            {tr(settings.language, "Créer une stratégie", "Create strategy")}
          </button>
        </div>
      ) : (
        /* Grille de cartes */
        <div className="strategies-grid">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              language={settings.language}
              strategy={s}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* ── Modal de formulaire (créer / modifier) ─── */}
      {formMode !== "closed" && (
        <StrategyFormModal
          mode={formMode}
          language={settings.language}
          initial={formData}
          saving={saving}
          errors={formErrors}
          onChange={handleFormChange}
          onSave={() => void handleSave()}
          onCancel={closeModal}
        />
      )}

      {/* ── Dialogue de confirmation suppression ─────── */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={tr(
          settings.language,
          "Supprimer la stratégie",
          "Delete strategy",
        )}
        message={tr(
          settings.language,
          `Voulez-vous vraiment supprimer "${deleteTarget?.name}" ? Les trades utilisant cette stratégie conserveront leurs données mais ne seront plus associés à aucune stratégie.`,
          `Do you really want to delete "${deleteTarget?.name}"? Trades using this strategy keep their data but will no longer be linked to any strategy.`,
        )}
        confirmLabel={tr(settings.language, "Supprimer", "Delete")}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
