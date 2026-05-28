// ============================================================
// MT5DateRangeSelector — Sélecteur de période pour l'historique MT5
// ============================================================
// Phase 6 Étape 3 — Prévisualisation de l'historique MT5 (lecture seule).
//
// Ce composant permet de choisir :
//   - Une période prédéfinie : Aujourd'hui | 7 jours | 30 jours
//   - Une plage personnalisée : date de début + date de fin
//
// Il NE déclenche PAS la requête lui-même — il appelle onFetch()
// avec les paramètres sélectionnés.
// ============================================================

import { useState } from "react";
import { Calendar, Search } from "lucide-react";
import type { MT5HistoryPeriod } from "../../../types/mt5";

// ─── Types ────────────────────────────────────────────────

interface MT5DateRangeSelectorProps {
  /** Appelé quand l'utilisateur clique sur "Charger l'historique". */
  onFetch: (
    period: MT5HistoryPeriod,
    fromDate: string | null,
    toDate: string | null,
  ) => void;

  /** Désactiver les contrôles pendant le chargement. */
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

/** Retourne la date d'aujourd'hui au format YYYY-MM-DD. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Retourne la date d'il y a N jours au format YYYY-MM-DD.
 * Utilisé pour pré-remplir le champ "du" en mode personnalisé.
 */
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Sous-composant : bouton de période prédéfinie ────────

interface PeriodBtnProps {
  label: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

function PeriodBtn({
  label,
  description,
  active,
  disabled,
  onClick,
}: PeriodBtnProps) {
  return (
    <button
      type="button"
      className={`mt5-period-btn ${active ? "mt5-period-btn--active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={description}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ─── Composant principal ──────────────────────────────────

export default function MT5DateRangeSelector({
  onFetch,
  disabled = false,
}: MT5DateRangeSelectorProps) {
  // Période sélectionnée ("today" | "7d" | "30d" | "custom")
  const [period, setPeriod] = useState<MT5HistoryPeriod>("30d");

  // Plage personnalisée (activée seulement si period === "custom")
  const [fromDate, setFromDate] = useState<string>(daysAgoStr(29));
  const [toDate, setToDate] = useState<string>(todayStr());

  // ── Sélection d'une période prédéfinie ─────────────────
  function selectPeriod(p: MT5HistoryPeriod) {
    setPeriod(p);
    // Pré-remplir les champs custom avec des valeurs cohérentes
    if (p === "today") setFromDate(todayStr());
    else if (p === "7d") setFromDate(daysAgoStr(6));
    else if (p === "30d") setFromDate(daysAgoStr(29));
    setToDate(todayStr());
  }

  // ── Déclencher le chargement ───────────────────────────
  function handleFetch() {
    if (period === "custom") {
      onFetch("custom", fromDate || null, toDate || null);
    } else {
      onFetch(period, null, null);
    }
  }

  return (
    <div className="mt5-date-range-selector">
      {/* Périodes prédéfinies */}
      <div className="mt5-date-range-selector__presets">
        <span className="mt5-date-range-selector__label">Période :</span>
        <div
          className="mt5-date-range-selector__btns"
          role="group"
          aria-label="Sélection de période"
        >
          <PeriodBtn
            label="Aujourd'hui"
            description="Deals de la journée en cours"
            active={period === "today"}
            disabled={disabled}
            onClick={() => selectPeriod("today")}
          />
          <PeriodBtn
            label="7 jours"
            description="Deals des 7 derniers jours"
            active={period === "7d"}
            disabled={disabled}
            onClick={() => selectPeriod("7d")}
          />
          <PeriodBtn
            label="30 jours"
            description="Deals des 30 derniers jours"
            active={period === "30d"}
            disabled={disabled}
            onClick={() => selectPeriod("30d")}
          />
          <PeriodBtn
            label="Personnalisé"
            description="Choisir une plage de dates"
            active={period === "custom"}
            disabled={disabled}
            onClick={() => selectPeriod("custom")}
          />
        </div>
      </div>

      {/* Plage personnalisée (visible uniquement si period === "custom") */}
      {period === "custom" && (
        <div className="mt5-date-range-selector__custom">
          <Calendar
            size={13}
            className="mt5-date-range-selector__custom-icon"
            aria-hidden
          />
          <div className="mt5-date-range-selector__custom-fields">
            <div className="mt5-date-range-selector__field">
              <label
                className="mt5-date-range-selector__field-label"
                htmlFor="mt5-history-from"
              >
                Du
              </label>
              <input
                id="mt5-history-from"
                type="date"
                className="mt5-date-range-selector__date-input"
                value={fromDate}
                max={toDate || todayStr()}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={disabled}
              />
            </div>

            <span className="mt5-date-range-selector__separator" aria-hidden>
              →
            </span>

            <div className="mt5-date-range-selector__field">
              <label
                className="mt5-date-range-selector__field-label"
                htmlFor="mt5-history-to"
              >
                Au
              </label>
              <input
                id="mt5-history-to"
                type="date"
                className="mt5-date-range-selector__date-input"
                value={toDate}
                min={fromDate}
                max={todayStr()}
                onChange={(e) => setToDate(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bouton de chargement */}
      <button
        type="button"
        className="btn-primary mt5-date-range-selector__fetch-btn"
        onClick={handleFetch}
        disabled={disabled || (period === "custom" && !fromDate)}
        aria-busy={disabled}
      >
        {disabled ? (
          <>
            <Search size={13} aria-hidden />
            Chargement…
          </>
        ) : (
          <>
            <Search size={13} aria-hidden />
            Charger l'historique
          </>
        )}
      </button>
    </div>
  );
}
