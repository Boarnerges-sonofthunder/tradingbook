// ============================================================
// MT5HistoryPreview — Prévisualisation de l'historique des deals MT5
// ============================================================
// Phase 6 Étape 3 — Lecture seule, AUCUN import dans SQLite.
//
// Ce composant affiche :
//   - Un état d'attente (idle)
//   - Un spinner de chargement (loading)
//   - Une erreur structurée avec code et message (error)
//   - Un message "aucun deal" si la période est vide (empty)
//   - Un tableau de prévisualisation des deals bruts MT5 (success)
//
// DONNÉES AFFICHÉES (brutes MT5, sans mapping TradingBook) :
//   Heure | Symbole | Type | Entrée/Sortie | Volume | Prix | Commission | Swap | P&L
//
// DIFFÉRENCE DEALS vs TRADES :
//   Un deal = une transaction atomique MT5.
//   Un trade TradingBook = une position complète (entrée + sortie + P&L net).
//   Le mapping deal→trade sera fait à l'Étape 4.
// ============================================================

import { memo, useMemo } from "react";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  CircleDot,
  ChevronRight,
} from "lucide-react";
import type {
  MT5HistoryResult,
  MT5RawDeal,
  MT5HistoryStatus,
} from "../../../types/mt5";
import { useUserSettings, useVirtualList } from "../../../hooks";
import { formatShortDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import { MT5ErrorPanel } from "./MT5ErrorPanel";

const MT5_HISTORY_ROW_HEIGHT = 37;
const MT5_HISTORY_MAX_HEIGHT = 520;
const MT5_HISTORY_VIRTUALIZATION_THRESHOLD = 60;

// ─── Helpers ──────────────────────────────────────────────

/**
 * Formate un timestamp ISO 8601 UTC en date/heure locale lisible.
 * Affiche uniquement l'heure si c'est aujourd'hui, sinon date + heure.
 */
function fmtDealTime(
  isoStr: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  return formatShortDateTimeForSettings(
    isoStr,
    settings,
    isoStr.slice(0, 16).replace("T", " "),
  );
}

/**
 * Formate un nombre flottant avec un signe explicite (+/-).
 * Utilisé pour P&L, commission, swap.
 */
function fmtSigned(value: number, decimals = 2): string {
  const formatted = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return `0.${"0".repeat(decimals)}`;
}

/**
 * Classe CSS de couleur pour une valeur financière signée.
 */
function pnlClass(value: number): string {
  if (value > 0) return "mt5-history-preview__num--positive";
  if (value < 0) return "mt5-history-preview__num--negative";
  return "";
}

// ─── Sous-composants ──────────────────────────────────────

/** Badge visuel pour le type de deal (buy/sell/balance/etc.). */
const DealTypeBadge = memo(function DealTypeBadge({
  type,
  entry,
}: {
  type: string;
  entry: string;
}) {
  const isBuy = type === "buy";
  const isSell = type === "sell";
  const isTrading = isBuy || isSell;

  if (!isTrading) {
    return (
      <span className="mt5-deal-badge mt5-deal-badge--neutral">
        <CircleDot size={10} aria-hidden />
        {type}
      </span>
    );
  }

  return (
    <span
      className={`mt5-deal-badge ${isBuy ? "mt5-deal-badge--buy" : "mt5-deal-badge--sell"}`}
    >
      {isBuy ? (
        <TrendingUp size={10} aria-hidden />
      ) : (
        <TrendingDown size={10} aria-hidden />
      )}
      {type.toUpperCase()}
      <span className="mt5-deal-badge__entry">{entry}</span>
    </span>
  );
});

/** Ligne d'un deal dans le tableau de prévisualisation. */
const DealRow = memo(function DealRow({
  deal,
  settings,
}: {
  deal: MT5RawDeal;
  settings: ReturnType<typeof useUserSettings>;
}) {
  const netPnl = deal.profit + deal.commission + deal.swap + deal.fee;

  return (
    <tr className="mt5-history-preview__row">
      <td className="mt5-history-preview__cell mt5-history-preview__cell--time">
        <Clock
          size={10}
          aria-hidden
          className="mt5-history-preview__cell-icon"
        />
        {fmtDealTime(deal.time, settings)}
      </td>
      <td className="mt5-history-preview__cell mt5-history-preview__cell--symbol">
        {deal.symbol || "—"}
      </td>
      <td className="mt5-history-preview__cell">
        <DealTypeBadge type={deal.type} entry={deal.entry} />
      </td>
      <td className="mt5-history-preview__cell mt5-history-preview__num">
        {deal.volume > 0 ? deal.volume.toFixed(2) : "—"}
      </td>
      <td className="mt5-history-preview__cell mt5-history-preview__num">
        {deal.price > 0 ? deal.price.toFixed(5) : "—"}
      </td>
      <td
        className={`mt5-history-preview__cell mt5-history-preview__num ${pnlClass(deal.commission)}`}
      >
        {deal.commission !== 0 ? fmtSigned(deal.commission) : "—"}
      </td>
      <td
        className={`mt5-history-preview__cell mt5-history-preview__num ${pnlClass(deal.swap)}`}
      >
        {deal.swap !== 0 ? fmtSigned(deal.swap) : "—"}
      </td>
      <td
        className={`mt5-history-preview__cell mt5-history-preview__num mt5-history-preview__num--pnl ${pnlClass(netPnl)}`}
      >
        {fmtSigned(netPnl)}
      </td>
      {deal.comment && (
        <td className="mt5-history-preview__cell mt5-history-preview__cell--comment">
          <span title={deal.comment}>
            {deal.comment.slice(0, 30)}
            {deal.comment.length > 30 ? "…" : ""}
          </span>
        </td>
      )}
    </tr>
  );
});

// ─── Composant principal ──────────────────────────────────

interface MT5HistoryPreviewProps {
  /** Statut courant du chargement. */
  status: MT5HistoryStatus;

  /** Résultat de la dernière requête (null si idle). */
  result: MT5HistoryResult | null;
}

export default function MT5HistoryPreview({
  status,
  result,
}: MT5HistoryPreviewProps) {
  const settings = useUserSettings();
  const deals = result?.deals ?? [];
  const sortedDeals = useMemo(
    () =>
      [...deals].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
      ),
    [deals],
  );
  const shouldVirtualize =
    status === "success" &&
    sortedDeals.length > MT5_HISTORY_VIRTUALIZATION_THRESHOLD;
  const {
    containerRef,
    handleScroll,
    startIndex,
    endIndex,
    offsetTop,
    offsetBottom,
  } = useVirtualList({
    itemCount: sortedDeals.length,
    itemHeight: MT5_HISTORY_ROW_HEIGHT,
    overscan: 10,
    enabled: shouldVirtualize,
  });
  const visibleDeals = useMemo(
    () => (shouldVirtualize ? sortedDeals.slice(startIndex, endIndex) : sortedDeals),
    [endIndex, shouldVirtualize, sortedDeals, startIndex],
  );

  // ── Idle ────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="mt5-history-preview mt5-history-preview--idle">
        <CircleDot
          size={16}
          aria-hidden
          className="mt5-history-preview__idle-icon"
        />
        <p className="mt5-history-preview__idle-text">
          Choisissez une période et cliquez sur{" "}
          <strong>Charger l'historique</strong> pour prévisualiser vos deals
          MT5.
        </p>
        <p className="mt5-history-preview__idle-hint">
          Aucun trade ne sera importé — lecture seule.
        </p>
      </div>
    );
  }

  // ── Chargement ──────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="mt5-history-preview mt5-history-preview--loading">
        <div
          className="mt5-history-preview__spinner"
          aria-label="Chargement en cours"
        />
        <p className="mt5-history-preview__loading-text">
          Lecture de l'historique MT5…
        </p>
      </div>
    );
  }

  // ── Erreur ──────────────────────────────────────────────
  if (status === "error" && result !== null) {
    return (
      <MT5ErrorPanel
        errorCode={result.errorCode}
        message={result.message}
        title="Impossible de lire l'historique MT5"
        compact
        showActions={false}
        className="mt5-history-preview mt5-history-preview--error"
      />
    );
  }

  // ── Aucun deal ──────────────────────────────────────────
  if (
    status === "empty" ||
    (status === "success" && result?.totalDeals === 0)
  ) {
    return (
      <div className="mt5-history-preview mt5-history-preview--empty">
        <CircleDot size={14} aria-hidden />
        <p className="mt5-history-preview__empty-text">
          Aucun deal trouvé sur la période sélectionnée.
        </p>
        {result?.range && (
          <p className="mt5-history-preview__empty-range">
            {result.range.from.slice(0, 10)} → {result.range.to.slice(0, 10)}
          </p>
        )}
      </div>
    );
  }

  // ── Succès avec données ─────────────────────────────────
  if (status === "success" && result !== null && result.deals.length > 0) {
    return (
      <div className="mt5-history-preview mt5-history-preview--success">
        {/* En-tête avec méta-infos */}
        <div className="mt5-history-preview__header">
          <div className="mt5-history-preview__meta">
            <span className="mt5-history-preview__total">
              <strong>{result.totalDeals}</strong> deal(s)
            </span>
            {result.range && (
              <span className="mt5-history-preview__range">
                {result.range.from.slice(0, 10)} →{" "}
                {result.range.to.slice(0, 10)}
              </span>
            )}
            {result.broker && (
              <span className="mt5-history-preview__broker">
                {result.broker}
                {result.account != null && ` · #${result.account}`}
                {result.currency && ` · ${result.currency}`}
              </span>
            )}
          </div>

          {/* Avertissement lecture seule */}
          <div className="mt5-history-preview__readonly-badge">
            <ChevronRight size={10} aria-hidden />
            Prévisualisation — aucun import
          </div>
        </div>

        {/* Tableau des deals */}
        <div
          ref={containerRef}
          className={`mt5-history-preview__table-wrapper${shouldVirtualize ? " mt5-history-preview__table-wrapper--virtualized" : ""}`}
          onScroll={handleScroll}
          style={
            shouldVirtualize
              ? { maxHeight: `${MT5_HISTORY_MAX_HEIGHT}px` }
              : undefined
          }
        >
          <table className="mt5-history-preview__table">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Symbole</th>
                <th>Type</th>
                <th className="mt5-history-preview__num">Vol.</th>
                <th className="mt5-history-preview__num">Prix</th>
                <th className="mt5-history-preview__num">Comm.</th>
                <th className="mt5-history-preview__num">Swap</th>
                <th className="mt5-history-preview__num">P&L net</th>
              </tr>
            </thead>
            <tbody>
              {shouldVirtualize && offsetTop > 0 && (
                <tr className="table-virtual-spacer" aria-hidden="true">
                  <td colSpan={8} style={{ height: `${offsetTop}px` }} />
                </tr>
              )}
              {visibleDeals.map((deal) => (
                <DealRow key={deal.ticket} deal={deal} settings={settings} />
              ))}
              {shouldVirtualize && offsetBottom > 0 && (
                <tr className="table-virtual-spacer" aria-hidden="true">
                  <td colSpan={8} style={{ height: `${offsetBottom}px` }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Note de bas de tableau */}
        <p className="mt5-history-preview__footnote">
          Données brutes MT5 — le mapping en trades TradingBook sera disponible
          à l'étape suivante.
        </p>
      </div>
    );
  }

  return null;
}
