// ============================================================
// TradeForm — Formulaire de création manuelle d'un trade
// ============================================================
// Permet à l'utilisateur de saisir tous les détails d'un trade
// manuellement et de le sauvegarder dans SQLite.
//
// ── Flux ─────────────────────────────────────────────────
//   Formulaire → parseValues() → createTrade() (service)
//     → validate() (Zod) → insertTrade() (repo) → SQLite
//
// ── Calculs automatiques ──────────────────────────────────
//   netPnl = grossPnl − commission − swap − fees
//   riskRewardRatio = reward / risk  (si SL + TP renseignés)
//   outcome = win / loss / breakeven (d'après netPnl)
//
// ── Règles métier ─────────────────────────────────────────
//   - Un trade fermé (status="closed") exige closedAt + exitPrice
//     (validé par CreateTradeInputSchema.refine)
//   - platform et source sont "manual" en creation, preserves en edition
//   - symbol est normalisé en majuscules
//
// ── Utilisation ───────────────────────────────────────────
//   <TradeForm
//     onSuccess={(trade) => navigate(`/trades/${trade.id}`)}
//     onCancel={() => navigate("/trades")}
//   />
// ============================================================

import { useState, useEffect } from "react";
import type { Trade, TradeSide, Strategy } from "../../types";
import type { CreateTradeInput } from "../../types";
import { createTrade, updateTrade } from "../../services/trades/tradesService";
import { getStrategies } from "../../services/strategies/strategiesService";
import { getTypedSettings } from "../../services/settings/settingsService";
import { ValidationError } from "../../validation";
import { useNotification } from "../../hooks";
import {
  computeRiskReward,
  computeRiskDistance,
  computeRewardDistance,
  computeRRR,
  computeOutcome,
  validateStopLoss,
  validateTakeProfit,
} from "../../utils";

// ─── Types internes ────────────────────────────────────────

/**
 * État du formulaire — tous les champs sont des strings pour
 * permettre une saisie partielle sans erreur de type React.
 * La conversion en nombre se fait uniquement à la soumission.
 */
interface FormValues {
  symbol: string;
  side: TradeSide;
  status: "open" | "closed";
  openedAt: string; // format datetime-local : "YYYY-MM-DDTHH:MM"
  closedAt: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  volume: string;
  commission: string;
  swap: string;
  fees: string;
  grossPnl: string;
  currency: string;
  strategyId: string; // "" ou ID numérique en string
}

// ─── Props ─────────────────────────────────────────────────

export interface TradeFormProps {
  /** Appelé après la sauvegarde réussie du trade en base. */
  onSuccess: (trade: Trade) => void;
  /** Appelé quand l'utilisateur clique sur "Annuler". */
  onCancel?: () => void;
  /** Si fourni, le formulaire est en mode édition (prérempli + updateTrade). */
  initialTrade?: Trade;
}

// ─── Helpers de conversion ─────────────────────────────────

/** Renvoie la date/heure courante au format datetime-local. */
function nowDatetimeLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())}T` +
    `${pad(now.getHours())}:` +
    `${pad(now.getMinutes())}`
  );
}

/**
 * Convertit une valeur datetime-local en ISO 8601 complet.
 * "2024-01-15T14:30" → "2024-01-15T14:30:00.000Z" (UTC local)
 * Retourne la chaîne originale si déjà complète.
 */
function toIso(val: string): string {
  if (!val) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toISOString();
}

/** Convertit une string en nombre ou retourne 0 si vide/invalide. */
function toNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/** Convertit une string en nombre ou retourne null si vide/invalide. */
function toNumOrNull(val: string): number | null {
  if (!val.trim()) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

/** Convertit une date ISO 8601 en format datetime-local (YYYY-MM-DDTHH:MM). */
function isoToDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-` +
    `${pad(d.getMonth() + 1)}-` +
    `${pad(d.getDate())}T` +
    `${pad(d.getHours())}:` +
    `${pad(d.getMinutes())}`
  );
}

/** Construit les valeurs initiales depuis un Trade existant (mode édition). */
function buildInitialValues(trade?: Trade): FormValues {
  if (!trade) return INITIAL_VALUES;
  return {
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status === "cancelled" ? "closed" : trade.status,
    openedAt: isoToDatetimeLocal(trade.openedAt),
    closedAt: trade.closedAt ? isoToDatetimeLocal(trade.closedAt) : "",
    entryPrice: String(trade.entryPrice),
    exitPrice: trade.exitPrice != null ? String(trade.exitPrice) : "",
    stopLoss: trade.stopLoss != null ? String(trade.stopLoss) : "",
    takeProfit: trade.takeProfit != null ? String(trade.takeProfit) : "",
    volume: String(trade.volume),
    commission: String(trade.commission),
    swap: String(trade.swap),
    fees: String(trade.fees),
    grossPnl: trade.grossPnl != null ? String(trade.grossPnl) : "",
    currency: trade.currency,
    strategyId: trade.strategyId != null ? String(trade.strategyId) : "",
  };
}

// ─── Valeurs initiales ────────────────────────────────────

const INITIAL_VALUES: FormValues = {
  symbol: "",
  side: "buy",
  status: "open",
  openedAt: nowDatetimeLocal(),
  closedAt: "",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  takeProfit: "",
  volume: "",
  commission: "0",
  swap: "0",
  fees: "0",
  grossPnl: "",
  currency: "USD",
  strategyId: "",
};

// ─── Composant ─────────────────────────────────────────────

export default function TradeForm({
  onSuccess,
  onCancel,
  initialTrade,
}: TradeFormProps) {
  const notify = useNotification();

  const [values, setValues] = useState<FormValues>(() =>
    buildInitialValues(initialTrade),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  useEffect(() => {
    if (initialTrade) return;
    let cancelled = false;

    getTypedSettings()
      .then((settings) => {
        if (cancelled) return;
        setValues((prev) => ({
          ...prev,
          currency:
            prev.currency === INITIAL_VALUES.currency
              ? settings.defaultCurrency
              : prev.currency,
          volume:
            prev.volume.trim() === ""
              ? String(settings.defaultLotSize)
              : prev.volume,
        }));
      })
      .catch(() => {
        // Les valeurs par defaut du formulaire restent utilisables.
      });

    return () => {
      cancelled = true;
    };
  }, [initialTrade]);

  // Chargement des stratégies actives au montage
  useEffect(() => {
    getStrategies(true)
      .then(setStrategies)
      .catch(() => {
        // Échec silencieux — le select affichera "Aucune stratégie"
      });
  }, []);

  // ── Helpers de mise à jour de l'état ─────────────────────

  function set(
    field: keyof FormValues,
    value: string | TradeSide | "open" | "closed",
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Changement de statut open ↔ closed.
   *
   * Règle métier :
   *   - open   : pas de date de fermeture, pas de prix de sortie, pas de P&L
   *   - closed : closedAt + exitPrice + grossPnl obligatoires
   *
   * Quand on repasse de "closed" à "open", on efface les champs de clôture
   * pour éviter de conserver des données incohérentes (une date de fermeture
   * sur un trade toujours ouvert n'a pas de sens).
   */
  function handleStatusChange(newStatus: "open" | "closed") {
    setValues((prev) => {
      if (newStatus === "open") {
        return {
          ...prev,
          status: "open",
          closedAt: "",
          exitPrice: "",
          grossPnl: "",
        };
      }
      return { ...prev, status: "closed" };
    });
  }

  // ── Valeurs calculées en temps réel ──────────────────────

  const isClosed = values.status === "closed";

  const grossPnl = toNumOrNull(values.grossPnl);
  const commission = toNum(values.commission);
  const swap = toNum(values.swap);
  const fees = toNum(values.fees);

  // netPnl est calculé seulement si grossPnl est renseigné
  const netPnl: number | null =
    grossPnl !== null ? grossPnl - commission - swap - fees : null;

  const entryPrice = toNum(values.entryPrice);
  const sl = toNumOrNull(values.stopLoss);
  const tp = toNumOrNull(values.takeProfit);
  const rrr = computeRRR(entryPrice, sl, tp, values.side);
  const outcome = computeOutcome(netPnl);
  const slWarning = validateStopLoss(entryPrice, sl, values.side);
  const tpWarning = validateTakeProfit(entryPrice, tp, values.side);

  // ── Soumission ───────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    try {
      // Construction de l'objet CreateTradeInput
      const input: CreateTradeInput = {
        // Champs obligatoires
        symbol: values.symbol.trim().toUpperCase(),
        side: values.side,
        openedAt: toIso(values.openedAt),
        entryPrice: toNum(values.entryPrice),
        volume: toNum(values.volume),

        // Creation manuelle par defaut; en edition, on preserve l'origine.
        externalId: initialTrade?.externalId ?? null,
        broker: initialTrade?.broker ?? null,
        accountId: initialTrade?.accountId ?? null,
        platform: initialTrade?.platform ?? "manual",
        source: initialTrade?.source ?? "manual",
        importId: initialTrade?.importId ?? null,
        status: values.status,

        // Champs de clôture (conditionnels)
        ...(isClosed && {
          closedAt: toIso(values.closedAt),
          exitPrice: toNumOrNull(values.exitPrice),
          grossPnl: grossPnl,
          netPnl: netPnl,
          outcome: outcome ?? undefined,
        }),

        // Gestion du risque (optionnels)
        stopLoss: sl,
        takeProfit: tp,
        ...(() => {
          const rr = computeRiskReward(entryPrice, sl, tp, values.side);
          return {
            riskAmount: computeRiskDistance(entryPrice, sl, values.side),
            rewardAmount: computeRewardDistance(entryPrice, tp, values.side),
            riskRewardRatio: rr?.ratio ?? null,
          };
        })(),

        // Frais (0 par défaut)
        commission: commission,
        swap: swap,
        fees: fees,

        // Devise
        currency: values.currency.trim() || "USD",

        // Stratégie
        strategyId: values.strategyId ? parseInt(values.strategyId, 10) : null,
      };

      let saved: Trade;
      if (initialTrade) {
        const updated = await updateTrade(initialTrade.id, input);
        if (!updated) throw new Error("Trade introuvable pour la mise à jour");
        saved = updated;
        notify.success(`Trade ${saved.symbol} mis à jour`);
      } else {
        saved = await createTrade(input);
        notify.success(
          `Trade ${saved.symbol} enregistré avec succès (ID #${saved.id})`,
        );
      }
      onSuccess(saved);
    } catch (err) {
      if (err instanceof ValidationError) {
        // Erreurs de validation Zod — afficher dans le formulaire
        setErrors(err.issues);
        notify.error("Formulaire invalide — vérifiez les champs");
      } else {
        // Erreur inattendue (SQLite, IPC Tauri, etc.)
        // Le plugin @tauri-apps/plugin-sql rejette avec une string, pas un Error
        const errMsg =
          typeof err === "string"
            ? err
            : err instanceof Error
              ? err.message
              : String(err);
        console.error("[TradeForm] Erreur lors de la sauvegarde :", err);
        setErrors([`Erreur interne : ${errMsg}`]);
        notify.error(`Erreur lors de la sauvegarde : ${errMsg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Rendu des champs calculés ─────────────────────────────

  function renderCalculatedPnl() {
    if (netPnl === null) {
      return (
        <input
          type="text"
          value="—"
          readOnly
          className="input-calculated"
          aria-label="P&L net calculé"
        />
      );
    }
    const cls =
      netPnl > 0
        ? "input-calculated input-calculated--positive"
        : netPnl < 0
          ? "input-calculated input-calculated--negative"
          : "input-calculated";
    return (
      <input
        type="text"
        value={`${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)}`}
        readOnly
        className={cls}
        aria-label="P&L net calculé"
      />
    );
  }

  function renderCalculatedRRR() {
    if (rrr === null) {
      return (
        <input
          type="text"
          value="—"
          readOnly
          className="input-calculated"
          aria-label="Ratio risque/récompense calculé"
        />
      );
    }
    return (
      <input
        type="text"
        value={`${rrr.toFixed(2)} R`}
        readOnly
        className="input-calculated"
        aria-label="Ratio risque/récompense calculé"
      />
    );
  }

  // ── JSX principal ─────────────────────────────────────────

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      noValidate
      aria-label="Formulaire de création d'un trade"
    >
      <div className="form-body">
        {/* ── Bannière d'erreurs ─────────────────────────── */}
        {errors.length > 0 && (
          <div className="form-errors-banner" role="alert">
            <p className="form-errors-banner__title">
              {errors.length} erreur{errors.length > 1 ? "s" : ""} à corriger
            </p>
            <ul className="form-errors-banner__list">
              {errors.map((err, i) => (
                <li key={i} className="form-errors-banner__item">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Section : Instrument ──────────────────────── */}
        <section className="form-section" aria-labelledby="section-instrument">
          <h2 className="form-section-title" id="section-instrument">
            Instrument
          </h2>

          <div className="form-grid form-grid--3">
            {/* Symbole */}
            <div className="form-group">
              <label
                className="form-label form-label--required"
                htmlFor="symbol"
              >
                Symbole
              </label>
              <input
                id="symbol"
                type="text"
                value={values.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder="EURUSD, BTCUSD…"
                maxLength={20}
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Direction */}
            <div className="form-group">
              <span className="form-label form-label--required">Direction</span>
              <div
                className="btn-toggle-group"
                role="group"
                aria-label="Direction du trade"
              >
                <button
                  type="button"
                  className={`btn-toggle btn-toggle--buy${values.side === "buy" ? " btn-toggle--active" : ""}`}
                  onClick={() => set("side", "buy")}
                  aria-pressed={values.side === "buy"}
                >
                  Achat
                </button>
                <button
                  type="button"
                  className={`btn-toggle btn-toggle--sell${values.side === "sell" ? " btn-toggle--active" : ""}`}
                  onClick={() => set("side", "sell")}
                  aria-pressed={values.side === "sell"}
                >
                  Vente
                </button>
              </div>
            </div>

            {/* Statut */}
            <div className="form-group">
              <span className="form-label form-label--required">Statut</span>
              <div
                className="btn-toggle-group"
                role="group"
                aria-label="Statut du trade"
              >
                <button
                  type="button"
                  className={`btn-toggle btn-toggle--open${values.status === "open" ? " btn-toggle--active" : ""}`}
                  onClick={() => handleStatusChange("open")}
                  aria-pressed={values.status === "open"}
                >
                  Ouvert
                </button>
                <button
                  type="button"
                  className={`btn-toggle btn-toggle--closed${values.status === "closed" ? " btn-toggle--active" : ""}`}
                  onClick={() => handleStatusChange("closed")}
                  aria-pressed={values.status === "closed"}
                >
                  Fermé
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section : Horaires ────────────────────────── */}
        <section className="form-section" aria-labelledby="section-horaires">
          <h2 className="form-section-title" id="section-horaires">
            Horaires
          </h2>

          <div className="form-grid">
            {/* Date / heure d'ouverture */}
            <div className="form-group">
              <label
                className="form-label form-label--required"
                htmlFor="openedAt"
              >
                Ouvert le
              </label>
              <input
                id="openedAt"
                type="datetime-local"
                value={values.openedAt}
                onChange={(e) => set("openedAt", e.target.value)}
                required
              />
            </div>

            {/* Date / heure de clôture (seulement si fermé) */}
            {isClosed && (
              <div className="form-group">
                <label
                  className="form-label form-label--required"
                  htmlFor="closedAt"
                >
                  Fermé le
                </label>
                <input
                  id="closedAt"
                  type="datetime-local"
                  value={values.closedAt}
                  onChange={(e) => set("closedAt", e.target.value)}
                  required={isClosed}
                  min={values.openedAt}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Section : Prix ────────────────────────────── */}
        <section className="form-section" aria-labelledby="section-prix">
          <h2 className="form-section-title" id="section-prix">
            Prix
          </h2>

          <div className="form-grid form-grid--4">
            {/* Prix d'entrée */}
            <div className="form-group">
              <label
                className="form-label form-label--required"
                htmlFor="entryPrice"
              >
                Prix d&apos;entrée
              </label>
              <input
                id="entryPrice"
                type="number"
                value={values.entryPrice}
                onChange={(e) => set("entryPrice", e.target.value)}
                placeholder="0.00000"
                step="any"
                min="0"
                required
              />
            </div>

            {/* Prix de sortie (seulement si fermé) */}
            {isClosed && (
              <div className="form-group">
                <label
                  className="form-label form-label--required"
                  htmlFor="exitPrice"
                >
                  Prix de sortie
                </label>
                <input
                  id="exitPrice"
                  type="number"
                  value={values.exitPrice}
                  onChange={(e) => set("exitPrice", e.target.value)}
                  placeholder="0.00000"
                  step="any"
                  min="0"
                  required={isClosed}
                />
              </div>
            )}

            {/* Stop Loss */}
            <div className="form-group">
              <label className="form-label" htmlFor="stopLoss">
                Stop Loss
              </label>
              <input
                id="stopLoss"
                type="number"
                value={values.stopLoss}
                onChange={(e) => set("stopLoss", e.target.value)}
                placeholder="Optionnel"
                step="any"
                min="0"
              />
              {slWarning && (
                <span className="form-hint form-hint--warning" role="alert">
                  ⚠ {slWarning}
                </span>
              )}
            </div>

            {/* Take Profit */}
            <div className="form-group">
              <label className="form-label" htmlFor="takeProfit">
                Take Profit
              </label>
              <input
                id="takeProfit"
                type="number"
                value={values.takeProfit}
                onChange={(e) => set("takeProfit", e.target.value)}
                placeholder="Optionnel"
                step="any"
                min="0"
              />
              {tpWarning && (
                <span className="form-hint form-hint--warning" role="alert">
                  ⚠ {tpWarning}
                </span>
              )}
            </div>
          </div>

          {/* RRR — champ calculé */}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">
                Ratio risque / récompense (calculé)
              </label>
              {renderCalculatedRRR()}
              {rrr === null && (tp !== null || sl !== null) && (
                <span className="form-hint">
                  Renseignez SL + TP pour calculer le RRR
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Section : Volume & Frais ──────────────────── */}
        <section className="form-section" aria-labelledby="section-frais">
          <h2 className="form-section-title" id="section-frais">
            Volume &amp; Frais
          </h2>

          <div className="form-grid form-grid--5">
            {/* Volume */}
            <div className="form-group">
              <label
                className="form-label form-label--required"
                htmlFor="volume"
              >
                Volume (lots)
              </label>
              <input
                id="volume"
                type="number"
                value={values.volume}
                onChange={(e) => set("volume", e.target.value)}
                placeholder="0.01"
                step="0.01"
                min="0"
                required
              />
            </div>

            {/* Commission */}
            <div className="form-group">
              <label className="form-label" htmlFor="commission">
                Commission
              </label>
              <input
                id="commission"
                type="number"
                value={values.commission}
                onChange={(e) => set("commission", e.target.value)}
                placeholder="0"
                step="any"
                min="0"
              />
            </div>

            {/* Swap */}
            <div className="form-group">
              <label className="form-label" htmlFor="swap">
                Swap
              </label>
              <input
                id="swap"
                type="number"
                value={values.swap}
                onChange={(e) => set("swap", e.target.value)}
                placeholder="0"
                step="any"
              />
            </div>

            {/* Frais divers */}
            <div className="form-group">
              <label className="form-label" htmlFor="fees">
                Frais divers
              </label>
              <input
                id="fees"
                type="number"
                value={values.fees}
                onChange={(e) => set("fees", e.target.value)}
                placeholder="0"
                step="any"
                min="0"
              />
            </div>

            {/* Devise */}
            <div className="form-group">
              <label className="form-label" htmlFor="currency">
                Devise
              </label>
              <input
                id="currency"
                type="text"
                value={values.currency}
                onChange={(e) => set("currency", e.target.value)}
                placeholder="USD"
                maxLength={10}
              />
            </div>
          </div>
        </section>

        {/* ── Section : P&L (seulement si trade fermé) ─── */}
        {isClosed && (
          <section className="form-section" aria-labelledby="section-pnl">
            <h2 className="form-section-title" id="section-pnl">
              P&amp;L
            </h2>

            <div className="form-grid">
              {/* P&L brut — saisi manuellement */}
              <div className="form-group">
                <label className="form-label" htmlFor="grossPnl">
                  P&amp;L brut (avant frais)
                </label>
                <input
                  id="grossPnl"
                  type="number"
                  value={values.grossPnl}
                  onChange={(e) => set("grossPnl", e.target.value)}
                  placeholder="Ex : 145.50 ou -32.00"
                  step="any"
                />
              </div>

              {/* P&L net — calculé automatiquement */}
              <div className="form-group">
                <label className="form-label">P&amp;L net (calculé)</label>
                {renderCalculatedPnl()}
                <span className="form-hint">
                  P&amp;L brut − commission − swap − frais divers
                </span>
              </div>
            </div>

            {/* Résultat du trade (calculé) */}
            {outcome && (
              <div className="form-group">
                <span className="form-label">Résultat</span>
                <span
                  className={`badge ${
                    outcome === "win"
                      ? "badge-positive"
                      : outcome === "loss"
                        ? "badge-negative"
                        : "badge-neutral"
                  }`}
                  style={{ alignSelf: "flex-start", padding: "4px 10px" }}
                >
                  {outcome === "win"
                    ? "Gain"
                    : outcome === "loss"
                      ? "Perte"
                      : "Breakeven"}
                </span>
              </div>
            )}
          </section>
        )}

        {/* ── Section : Stratégie ───────────────────────── */}
        <section className="form-section" aria-labelledby="section-strategie">
          <h2 className="form-section-title" id="section-strategie">
            Stratégie
          </h2>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="strategyId">
                Stratégie associée
              </label>
              <select
                id="strategyId"
                value={values.strategyId}
                onChange={(e) => set("strategyId", e.target.value)}
              >
                <option value="">— Aucune stratégie —</option>
                {strategies.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
              {strategies.length === 0 && (
                <span className="form-hint">
                  Créez d&apos;abord une stratégie dans l&apos;onglet Stratégies
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── Barre d'actions ───────────────────────────── */}
        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Annuler
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting
              ? "Enregistrement…"
              : initialTrade
                ? "Sauvegarder les modifications"
                : "Enregistrer le trade"}
          </button>
        </div>
      </div>
    </form>
  );
}
