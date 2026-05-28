// ============================================================
// MT5OpenPositionsPreview — Prévisualisation des positions ouvertes MT5
// ============================================================
// Phase 6 Étape 4 — Lecture seule, AUCUN import dans SQLite.
//
// Ce composant affiche :
//   - Un état d'attente (idle)
//   - Un spinner de chargement (loading)
//   - Une erreur structurée avec code et message (error)
//   - Un message "aucune position" si le compte n'a pas de position ouverte (empty)
//   - Un tableau de prévisualisation des positions brutes MT5 (success)
//
// DONNÉES AFFICHÉES (brutes MT5, sans mapping TradingBook) :
//   Heure d'ouv. | Symbole | Type | Vol. | Prix ouv. | Prix act. | SL | TP | Swap | P&L non réalisé
//
// P&L NON RÉALISÉ = profit + swap
//   `profit`     = différence prix actuel vs prix ouverture (en devise du compte)
//   `swap`       = frais de roulement cumulés depuis l'ouverture
//   `commission` = commission d'ouverture uniquement (non incluse dans le P&L non réalisé)
//
// DIFFÉRENCE POSITIONS vs DEALS :
//   Position = trade actuellement ouvert (P&L non réalisé, prix en temps réel)
//   Deal     = transaction passée clôturée (historique)
//   Le mapping position→trade TradingBook sera fait à l'Étape 5.
// ============================================================

import { memo } from "react";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  CircleDot,
  Eye,
  RefreshCw,
} from "lucide-react";
import type {
  MT5PositionsResult,
  MT5RawPosition,
  MT5PositionsStatus,
} from "../../../types/mt5";
import { useUserSettings } from "../../../hooks";
import { formatShortDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import { MT5ErrorPanel } from "./MT5ErrorPanel";

// ─── Helpers ──────────────────────────────────────────────

/**
 * Formate un timestamp ISO 8601 UTC en date/heure locale lisible.
 * Affiche uniquement l'heure si c'est aujourd'hui, sinon date + heure.
 */
function fmtPositionTime(
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
 * Utilisé pour P&L non réalisé et swap.
 */
function fmtSigned(value: number, decimals = 2): string {
  const formatted = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return `0.${"0".repeat(decimals)}`;
}

/**
 * Formate un prix de manière adaptée (5 décimales pour le forex, 2 pour les matières premières).
 * Heuristique simple : si prix > 100, 2 décimales ; sinon 5.
 */
function fmtPrice(price: number): string {
  if (price <= 0) return "—";
  return price >= 100 ? price.toFixed(2) : price.toFixed(5);
}

/** Classe CSS de couleur pour une valeur financière signée. */
function pnlClass(value: number): string {
  if (value > 0) return "mt5-positions-preview__pnl--positive";
  if (value < 0) return "mt5-positions-preview__pnl--negative";
  return "";
}

// ─── Sous-composants ──────────────────────────────────────

/** Badge visuel pour le type de position (buy/sell). */
const PositionTypeBadge = memo(function PositionTypeBadge({
  type,
}: {
  type: string;
}) {
  const isBuy = type === "buy";
  const isSell = type === "sell";

  if (!isBuy && !isSell) {
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
    </span>
  );
});

interface PositionRowProps {
  position: MT5RawPosition;
  settings: ReturnType<typeof useUserSettings>;
}

/** Ligne d'une position dans le tableau de prévisualisation. */
const PositionRow = memo(function PositionRow({
  position,
  settings,
}: PositionRowProps) {
  // P&L non réalisé = profit + swap (commission = ouverture uniquement)
  const unrealizedPnl = position.profit + position.swap;

  return (
    <tr className="mt5-positions-preview__row">
      <td className="mt5-positions-preview__cell mt5-positions-preview__cell--time">
        <Clock
          size={10}
          aria-hidden
          className="mt5-positions-preview__cell-icon"
        />
        {fmtPositionTime(position.openTime, settings)}
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__cell--symbol">
        <strong>{position.symbol}</strong>
      </td>
      <td className="mt5-positions-preview__cell">
        <PositionTypeBadge type={position.type} />
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__num">
        {position.volume.toFixed(2)}
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__num">
        {fmtPrice(position.openPrice)}
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__num mt5-positions-preview__num--current">
        {fmtPrice(position.currentPrice)}
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__num">
        {position.stopLoss > 0 ? fmtPrice(position.stopLoss) : "—"}
      </td>
      <td className="mt5-positions-preview__cell mt5-positions-preview__num">
        {position.takeProfit > 0 ? fmtPrice(position.takeProfit) : "—"}
      </td>
      <td
        className={`mt5-positions-preview__cell mt5-positions-preview__num ${pnlClass(position.swap)}`}
      >
        {position.swap !== 0 ? fmtSigned(position.swap) : "—"}
      </td>
      <td
        className={`mt5-positions-preview__cell mt5-positions-preview__num mt5-positions-preview__pnl ${pnlClass(unrealizedPnl)}`}
      >
        {fmtSigned(unrealizedPnl)}
      </td>
    </tr>
  );
});

// ─── Composant principal ──────────────────────────────────

interface MT5OpenPositionsPreviewProps {
  /** Statut courant du chargement. */
  status: MT5PositionsStatus;

  /** Résultat de la dernière requête (null si idle). */
  result: MT5PositionsResult | null;
}

const MT5OpenPositionsPreview = memo(function MT5OpenPositionsPreview({
  status,
  result,
}: MT5OpenPositionsPreviewProps) {
  const settings = useUserSettings();

  // ── Idle ────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="mt5-positions-preview mt5-positions-preview--idle">
        <CircleDot
          size={16}
          aria-hidden
          className="mt5-positions-preview__idle-icon"
        />
        <p className="mt5-positions-preview__idle-text">
          Cliquez sur <strong>Actualiser les positions</strong> pour afficher
          les positions actuellement ouvertes dans MetaTrader 5.
        </p>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="mt5-positions-preview mt5-positions-preview--loading">
        <div className="mt5-positions-preview__spinner" aria-hidden />
        <p className="mt5-positions-preview__loading-text">
          Lecture des positions ouvertes MT5 en cours…
        </p>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────
  if (status === "error" || !result) {
    const errorCode = result?.errorCode ?? "UNKNOWN";
    const message =
      result?.message ?? "Erreur inconnue lors de la lecture des positions.";

    return (
      <MT5ErrorPanel
        errorCode={errorCode}
        message={message}
        title="Impossible de lire les positions ouvertes MT5"
        compact
        showActions={false}
        className="mt5-positions-preview mt5-positions-preview--error"
      />
    );
  }

  // ── Empty ───────────────────────────────────────────────
  if (status === "empty" || result.totalPositions === 0) {
    return (
      <div className="mt5-positions-preview mt5-positions-preview--empty">
        <CircleDot
          size={16}
          aria-hidden
          className="mt5-positions-preview__empty-icon"
        />
        <p className="mt5-positions-preview__empty-text">
          Aucune position ouverte sur ce compte.
        </p>
        {result.account && (
          <p className="mt5-positions-preview__empty-meta">
            Compte {result.account} — {result.server ?? "Serveur inconnu"}
          </p>
        )}
      </div>
    );
  }

  // ── Success ─────────────────────────────────────────────
  const { positions, totalPositions, account, server, currency } = result;

  return (
    <div className="mt5-positions-preview mt5-positions-preview--success">
      {/* En-tête */}
      <div className="mt5-positions-preview__header">
        <div className="mt5-positions-preview__meta">
          <span className="mt5-positions-preview__total">
            {totalPositions} position{totalPositions > 1 ? "s" : ""} ouverte
            {totalPositions > 1 ? "s" : ""}
          </span>
          {account && (
            <span className="mt5-positions-preview__account">
              Compte {account}
              {server ? ` — ${server}` : ""}
              {currency ? ` (${currency})` : ""}
            </span>
          )}
        </div>

        {/* Badge "prévisualisation" */}
        <span
          className="mt5-positions-preview__badge"
          aria-label="Prévisualisation — lecture seule"
        >
          <Eye size={12} aria-hidden />
          Prévisualisation — aucune position importée
        </span>
      </div>

      {/* Tableau */}
      <div className="mt5-positions-preview__table-wrapper">
        <table
          className="mt5-positions-preview__table"
          aria-label="Positions ouvertes MT5"
        >
          <thead>
            <tr>
              <th scope="col">Heure d'ouv.</th>
              <th scope="col">Symbole</th>
              <th scope="col">Type</th>
              <th scope="col" className="mt5-positions-preview__num">
                Vol.
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                Prix ouv.
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                Prix act.
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                SL
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                TP
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                Swap
              </th>
              <th scope="col" className="mt5-positions-preview__num">
                P&amp;L non réalisé
              </th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <PositionRow key={pos.ticket} position={pos} settings={settings} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Note informative */}
      <p className="mt5-positions-preview__note">
        <RefreshCw size={11} aria-hidden />
        Les données affichées reflètent l'état du terminal MT5 au moment de la
        dernière actualisation. Cliquez à nouveau sur{" "}
        <strong>Actualiser les positions</strong> pour obtenir les prix en temps
        réel.
      </p>
    </div>
  );
});

export default MT5OpenPositionsPreview;
