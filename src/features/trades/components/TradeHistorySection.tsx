// ============================================================
// TradeHistorySection — Historique des modifications d'un trade
// ============================================================
// Fonctionnalités :
//   - Affiche les événements importants liés au trade (timeline)
//   - Chaque entrée a : icône colorée, description, date relative
//   - Affiche old_value → new_value pour les changements de champ
//   - Limite à 20 entrées par défaut, bouton "Voir tout"
//
// Architecture :
//   - Source : table `trade_activity_logs` (SQLite)
//   - Chaque action est enregistrée fire-and-forget dans les services
//   - Jamais de SQL direct ici → activityService uniquement
//
// Catégories d'actions et couleurs associées :
//   - Cycle de vie (create/update/delete)  → accent (bleu/violet)
//   - Status / Stratégie                   → positive (vert)
//   - Notes                                → warning (orange)
//   - Tags                                 → mauve (#8b5cf6)
//   - Émotions                             → rose (#ec4899)
//   - Erreurs                              → negative (rouge)
//   - Captures d'écran                     → positive (vert)
// ============================================================

import { useState, useEffect } from "react";
import {
  Activity,
  FileText,
  Tag as TagIcon,
  Heart,
  AlertTriangle,
  Image,
  CheckCircle,
  BookOpen,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getActivityForTrade } from "../../../services/activity/activityService";
import type { TradeActivityLog, TradeActivityAction } from "../../../types";
import { useNotification, useUserSettings } from "../../../hooks";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";

// ─── Props ────────────────────────────────────────────────

interface TradeHistorySectionProps {
  /** Identifiant du trade parent. */
  tradeId: number;
}

// ─── Constantes de présentation ───────────────────────────

/** Nombre d'entrées affichées par défaut. */
const DEFAULT_VISIBLE = 20;

/** Icône Lucide et couleur CSS par type d'action. */
const ACTION_META: Record<
  TradeActivityAction,
  {
    Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    color: string;
  }
> = {
  trade_created: { Icon: Activity, color: "var(--color-accent)" },
  trade_updated: { Icon: Activity, color: "var(--color-accent)" },
  trade_deleted: { Icon: Activity, color: "var(--color-negative)" },
  status_changed: { Icon: CheckCircle, color: "var(--color-positive)" },
  strategy_changed: { Icon: BookOpen, color: "var(--color-accent)" },
  note_added: { Icon: FileText, color: "var(--color-warning)" },
  note_updated: { Icon: FileText, color: "var(--color-warning)" },
  note_deleted: { Icon: FileText, color: "var(--color-text-muted)" },
  tag_added: { Icon: TagIcon, color: "#8b5cf6" },
  tag_removed: { Icon: TagIcon, color: "var(--color-text-muted)" },
  emotion_added: { Icon: Heart, color: "#ec4899" },
  emotion_removed: { Icon: Heart, color: "var(--color-text-muted)" },
  mistake_added: { Icon: AlertTriangle, color: "var(--color-negative)" },
  mistake_removed: { Icon: AlertTriangle, color: "var(--color-text-muted)" },
  screenshot_added: { Icon: Image, color: "var(--color-positive)" },
  screenshot_removed: { Icon: Image, color: "var(--color-text-muted)" },
};

const DEFAULT_META = { Icon: Clock, color: "var(--color-text-muted)" };

// ─── Helpers ──────────────────────────────────────────────

/**
 * Formate une date ISO en texte relatif lisible.
 * Ex : "à l'instant", "il y a 5 min", "il y a 3h", "il y a 2j"
 * Au-delà de 7 jours → date complète.
 */
function formatRelativeTime(
  isoDate: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD < 7) return `il y a ${diffD}j`;

  return formatDateTimeForSettings(isoDate, settings, isoDate);
}

// ─── Sous-composant : une entrée de la timeline ───────────

interface HistoryEntryProps {
  log: TradeActivityLog;
  isLast: boolean;
  settings: ReturnType<typeof useUserSettings>;
}

function HistoryEntry({ log, isLast, settings }: HistoryEntryProps) {
  const meta = ACTION_META[log.action] ?? DEFAULT_META;
  const { Icon } = meta;

  return (
    <li
      className={`history-entry ${isLast ? "history-entry--last" : ""}`}
      aria-label={log.description}
    >
      {/* Cercle icône */}
      <div
        className="history-dot"
        style={{ "--history-dot-color": meta.color } as React.CSSProperties}
        aria-hidden
      >
        <Icon size={10} aria-hidden />
      </div>

      {/* Contenu */}
      <div className="history-content">
        <span className="history-description">{log.description}</span>

        {/* Changement de valeur old → new (trade_updated, status_changed) */}
        {log.oldValue && log.newValue && (
          <span
            className="history-field-change"
            aria-label={`${log.oldValue} → ${log.newValue}`}
          >
            <span className="history-field-change__old">{log.oldValue}</span>
            <span className="history-field-change__arrow" aria-hidden>
              →
            </span>
            <span className="history-field-change__new">{log.newValue}</span>
          </span>
        )}

        {/* Horodatage */}
        <time
          className="history-meta"
          dateTime={log.createdAt}
          title={formatDateTimeForSettings(log.createdAt, settings)}
        >
          {formatRelativeTime(log.createdAt, settings)}
        </time>
      </div>
    </li>
  );
}

// ─── Composant principal ──────────────────────────────────

export default function TradeHistorySection({
  tradeId,
}: TradeHistorySectionProps) {
  const notify = useNotification();
  const settings = useUserSettings();

  const [logs, setLogs] = useState<TradeActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // ── Chargement ───────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getActivityForTrade(tradeId)
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch(() => {
        if (!cancelled) notify.error("Impossible de charger l'historique");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  // ── Entrées visibles ─────────────────────────────────

  const visible = showAll ? logs : logs.slice(0, DEFAULT_VISIBLE);
  const hasMore = logs.length > DEFAULT_VISIBLE;

  // ── JSX ──────────────────────────────────────────────

  return (
    <section
      className="card history-section"
      aria-labelledby="history-section-title"
    >
      <h2 className="trade-detail-section-title" id="history-section-title">
        <Clock size={14} aria-hidden />
        Historique
        {!loading && logs.length > 0 && (
          <span className="history-count" aria-label={`${logs.length} entrées`}>
            {logs.length}
          </span>
        )}
      </h2>

      {loading ? (
        <p className="history-empty">Chargement…</p>
      ) : logs.length === 0 ? (
        <p className="history-empty">
          Aucun événement enregistré pour ce trade.
        </p>
      ) : (
        <>
          <ol
            className="history-timeline"
            aria-label="Chronologie des modifications"
          >
            {visible.map((log, idx) => (
              <HistoryEntry
                key={log.id}
                log={log}
                isLast={idx === visible.length - 1}
                settings={settings}
              />
            ))}
          </ol>

          {hasMore && (
            <button
              type="button"
              className="history-toggle btn-ghost"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
            >
              {showAll ? (
                <>
                  <ChevronUp size={13} aria-hidden />
                  Réduire
                </>
              ) : (
                <>
                  <ChevronDown size={13} aria-hidden />
                  Voir les {logs.length - DEFAULT_VISIBLE} entrées restantes
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}
