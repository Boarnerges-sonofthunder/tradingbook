// ============================================================
// TradeDetailsPage — Détail, édition et suppression d'un trade
// ============================================================
// Route dynamique : /trades/:id
//
// ── Modes ────────────────────────────────────────────────
//   consultation : affiche toutes les données du trade
//   édition      : formulaire prérempli via TradeForm + initialTrade
//
// ── Flux suppression ────────────────────────────────────
//   Bouton "Supprimer" → ConfirmDialog → deleteTrade() → ROUTES.TRADES
//
// ── Flux édition ────────────────────────────────────────
//   Bouton "Modifier" → TradeForm(initialTrade) → updateTrade()
//     → retour en mode consultation avec données mises à jour
// ============================================================

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { Trade } from "../types";
import { getTradeById, deleteTrade } from "../services/trades/tradesService";
import { getStrategyById } from "../services/strategies/strategiesService";
import TradeForm from "../components/forms/TradeForm";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import TradeNotesSection from "../features/trades/components/TradeNotesSection";
import TradeScreenshotsSection from "../features/trades/components/TradeScreenshotsSection";
import TradeTagsSection from "../features/trades/components/TradeTagsSection";
import TradeEmotionsSection from "../features/trades/components/TradeEmotionsSection";
import TradeMistakesSection from "../features/trades/components/TradeMistakesSection";
import TradeHistorySection from "../features/trades/components/TradeHistorySection";
import { useNotification, useUserSettings } from "../hooks";
import { ROUTES } from "../constants/routes";
import {
  formatDateTimeForSettings,
  formatMoneyForSettings,
} from "../services/settings/settingsFormatService";

// ─── Helpers d'affichage ──────────────────────────────────

function formatDate(iso: string | null, settings: ReturnType<typeof useUserSettings>): string {
  return formatDateTimeForSettings(iso, settings, "—");
}

function formatNum(val: number | null, decimals = 2): string {
  if (val === null) return "—";
  return val.toFixed(decimals);
}

function formatPnl(val: number | null, currency: string): string {
  if (val === null) return "—";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)} ${currency}`;
}

function computeOutcome(
  netPnl: number | null,
): "win" | "loss" | "breakeven" | null {
  if (netPnl === null) return null;
  if (netPnl > 0) return "win";
  if (netPnl < 0) return "loss";
  return "breakeven";
}

// ─── Composants de badge ──────────────────────────────────

function SideBadge({ side }: { side: "buy" | "sell" }) {
  return (
    <span
      className={`badge ${side === "buy" ? "badge-positive" : "badge-negative"}`}
    >
      {side === "buy" ? "Buy" : "Sell"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "open"
      ? "badge-accent"
      : status === "cancelled"
        ? "badge-warning"
        : "badge-neutral";
  const label =
    status === "open" ? "Ouvert" : status === "closed" ? "Fermé" : "Annulé";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="td-muted">—</span>;
  const cls =
    outcome === "win"
      ? "badge-positive"
      : outcome === "loss"
        ? "badge-negative"
        : "badge-neutral";
  const labels: Record<string, string> = {
    win: "Gain",
    loss: "Perte",
    breakeven: "Breakeven",
  };
  return <span className={`badge ${cls}`}>{labels[outcome] ?? outcome}</span>;
}

// ─── Ligne de détail ──────────────────────────────────────

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="trade-detail-row">
      <span className="trade-detail-label">{label}</span>
      <span className="trade-detail-value">{children}</span>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────

export default function TradeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotification();
  const settings = useUserSettings();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Chargement initial ───────────────────────────────────
  useEffect(() => {
    const numId = id ? parseInt(id, 10) : NaN;
    if (isNaN(numId)) {
      navigate(ROUTES.TRADES);
      return;
    }

    getTradeById(numId)
      .then((t) => {
        if (!t) {
          navigate(ROUTES.TRADES);
          return;
        }
        setTrade(t);
        if (t.strategyId) {
          getStrategyById(t.strategyId)
            .then((s) => setStrategyName(s?.name ?? null))
            .catch(() => {});
        }
      })
      .catch(() => navigate(ROUTES.TRADES))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  // ── Après édition ────────────────────────────────────────
  function handleEditSuccess(updated: Trade) {
    setTrade(updated);
    // Rafraîchir le nom de la stratégie si elle a changé
    if (updated.strategyId) {
      getStrategyById(updated.strategyId)
        .then((s) => setStrategyName(s?.name ?? null))
        .catch(() => {});
    } else {
      setStrategyName(null);
    }
    setEditing(false);
  }

  // ── Suppression ──────────────────────────────────────────
  async function handleDelete() {
    if (!trade) return;
    setDeleting(true);
    try {
      await deleteTrade(trade.id);
      notify.success(`Trade ${trade.symbol} supprimé`);
      navigate(ROUTES.TRADES);
    } catch (err) {
      const msg =
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : String(err);
      notify.error(`Erreur lors de la suppression : ${msg}`);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── États de chargement ───────────────────────────────────
  if (loading) {
    return (
      <div className="content-max">
        <p className="page-loading">Chargement du trade…</p>
      </div>
    );
  }

  if (!trade) return null;

  const outcome = computeOutcome(trade.netPnl);

  return (
    <div className="content-max">
      {/* ── En-tête ──────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <Link to={ROUTES.TRADES} className="page-back-link">
            <ArrowLeft size={14} aria-hidden />
            Retour au journal
          </Link>
          <div className="trade-detail-heading">
            <h1 className="page-title">{trade.symbol}</h1>
            <SideBadge side={trade.side} />
            <StatusBadge status={trade.status} />
            {outcome && <OutcomeBadge outcome={outcome} />}
          </div>
          <p className="page-subtitle">
            Trade #{trade.id} — ouvert le {formatDate(trade.openedAt, settings)}
          </p>
        </div>

        {/* Boutons d'action — masqués pendant l'édition */}
        {!editing && (
          <div className="page-actions">
            <button
              className="btn-secondary btn-icon-text"
              onClick={() => setEditing(true)}
              aria-label="Modifier ce trade"
            >
              <Pencil size={14} aria-hidden />
              Modifier
            </button>
            <button
              className="btn-danger btn-icon-text"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Supprimer ce trade"
            >
              <Trash2 size={14} aria-hidden />
              Supprimer
            </button>
          </div>
        )}
      </div>

      {/* ── Mode édition ────────────────────────────────── */}
      {editing ? (
        <TradeForm
          initialTrade={trade}
          onSuccess={handleEditSuccess}
          onCancel={() => setEditing(false)}
        />
      ) : (
        /* ── Mode consultation ────────────────────────── */
        <>
          <div className="trade-detail-grid">
            {/* Instrument */}
            <section className="card trade-detail-section">
              <h2 className="trade-detail-section-title">Instrument</h2>
              <DetailRow label="Symbole">{trade.symbol}</DetailRow>
              <DetailRow label="Côté">
                <SideBadge side={trade.side} />
              </DetailRow>
              <DetailRow label="Statut">
                <StatusBadge status={trade.status} />
              </DetailRow>
              <DetailRow label="Plateforme">{trade.platform}</DetailRow>
              {trade.broker && (
                <DetailRow label="Broker">{trade.broker}</DetailRow>
              )}
              {trade.accountId && (
                <DetailRow label="Compte">{trade.accountId}</DetailRow>
              )}
            </section>

            {/* Horaires */}
            <section className="card trade-detail-section">
              <h2 className="trade-detail-section-title">Horaires</h2>
              <DetailRow label="Ouvert le">
                {formatDate(trade.openedAt, settings)}
              </DetailRow>
              <DetailRow label="Fermé le">
                {formatDate(trade.closedAt, settings)}
              </DetailRow>
            </section>

            {/* Prix */}
            <section className="card trade-detail-section">
              <h2 className="trade-detail-section-title">Prix</h2>
              <DetailRow label="Prix d'entrée">
                {formatNum(trade.entryPrice, 5)}
              </DetailRow>
              <DetailRow label="Prix de sortie">
                {formatNum(trade.exitPrice, 5)}
              </DetailRow>
              <DetailRow label="Stop Loss">
                {formatNum(trade.stopLoss, 5)}
              </DetailRow>
              <DetailRow label="Take Profit">
                {formatNum(trade.takeProfit, 5)}
              </DetailRow>
              <DetailRow label="Distance SL">
                {trade.riskAmount != null
                  ? `${trade.riskAmount.toFixed(5)} pts`
                  : "—"}
              </DetailRow>
              <DetailRow label="Distance TP">
                {trade.rewardAmount != null
                  ? `${trade.rewardAmount.toFixed(5)} pts`
                  : "—"}
              </DetailRow>
              <DetailRow label="RRR">
                {trade.riskRewardRatio != null
                  ? `${trade.riskRewardRatio.toFixed(2)} R`
                  : "—"}
              </DetailRow>
            </section>

            {/* Volume & Frais */}
            <section className="card trade-detail-section">
              <h2 className="trade-detail-section-title">Volume &amp; Frais</h2>
              <DetailRow label="Volume">{trade.volume} lots</DetailRow>
              <DetailRow label="Commission">
                {formatMoneyForSettings(trade.commission, settings, {
                  fallback: "â€”",
                })}
              </DetailRow>
              <DetailRow label="Swap">
                {formatMoneyForSettings(trade.swap, settings, {
                  fallback: "â€”",
                })}
              </DetailRow>
              <DetailRow label="Frais divers">
                {formatMoneyForSettings(trade.fees, settings, {
                  fallback: "â€”",
                })}
              </DetailRow>
              <DetailRow label="Devise du trade">{trade.currency}</DetailRow>
              <DetailRow label="Devise d'affichage">
                {settings.defaultCurrency}
              </DetailRow>
            </section>

            {/* P&L — affiché uniquement si trade fermé */}
            {trade.status === "closed" && (
              <section className="card trade-detail-section">
                <h2 className="trade-detail-section-title">P&amp;L</h2>
                <DetailRow label="P&L brut">
                  <span
                    className={
                      trade.grossPnl !== null && trade.grossPnl >= 0
                        ? "text-positive"
                        : "text-negative"
                    }
                  >
                    {formatPnl(trade.grossPnl, settings.defaultCurrency)}
                  </span>
                </DetailRow>
                <DetailRow label="P&L net">
                  <span
                    className={
                      trade.netPnl !== null && trade.netPnl >= 0
                        ? "text-positive"
                        : "text-negative"
                    }
                  >
                    {formatPnl(trade.netPnl, settings.defaultCurrency)}
                  </span>
                </DetailRow>
                <DetailRow label="Résultat">
                  <OutcomeBadge outcome={outcome} />
                </DetailRow>
              </section>
            )}

            {/* Stratégie & Métadonnées */}
            <section className="card trade-detail-section">
              <h2 className="trade-detail-section-title">
                Stratégie &amp; Métadonnées
              </h2>
              <DetailRow label="Stratégie">
                {strategyName ??
                  (trade.strategyId ? `#${trade.strategyId}` : "—")}
              </DetailRow>
              {trade.externalId && (
                <DetailRow label="ID externe">{trade.externalId}</DetailRow>
              )}
              <DetailRow label="Créé le">
                {formatDate(trade.createdAt, settings)}
              </DetailRow>
              <DetailRow label="Mis à jour">
                {formatDate(trade.updatedAt, settings)}
              </DetailRow>
            </section>
          </div>

          {/* ── Tags du trade ──────────────────── */}
          <TradeTagsSection tradeId={trade.id} />

          {/* ── Émotions du trade ──────────────── */}
          <TradeEmotionsSection tradeId={trade.id} />

          {/* ── Erreurs commises ───────────────── */}
          <TradeMistakesSection tradeId={trade.id} />

          {/* ── Notes du trade ─────────────────── */}
          <TradeNotesSection tradeId={trade.id} />

          {/* ── Captures d'écran ──────────────── */}
          <TradeScreenshotsSection tradeId={trade.id} />

          {/* ── Historique des modifications ──── */}
          <TradeHistorySection tradeId={trade.id} />
        </>
      )}

      {/* ── Dialogue de confirmation suppression ─────── */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Supprimer le trade"
        message={`Voulez-vous vraiment supprimer le trade ${trade.symbol} (ID #${trade.id}) ? Cette action est irréversible et supprimera également les notes et captures d'écran associées.`}
        confirmLabel="Supprimer définitivement"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
