// ============================================================
// ImportHistoryList — Liste des sessions d'import
// ============================================================
// Phase 5 Étape 8 — Historique des imports CSV.
//
// Affiche toutes les sessions d'import enregistrées en SQLite,
// de la plus récente à la plus ancienne.
//
// Fonctionnalités :
//   - Liste des sessions avec statut, nom de fichier, date, broker
//   - Compteurs de lignes (importables / invalides)
//   - Expansion de chaque session pour voir ImportDetailsPanel
//   - Bouton de suppression (avec confirmation)
//   - Message vide si aucune session
//
// Props :
//   sessions  — tableau des sessions (déjà triées par date DESC)
//   onDelete  — callback appelé après confirmation de suppression
//   loading   — afficher un état de chargement
//
// Aucune logique SQL ici — purement UI + callbacks.
// ============================================================

import { useState } from "react";
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import ImportDetailsPanel from "./ImportDetailsPanel";
import DeleteDialog from "../../../components/ui/DeleteDialog";
import { useUserSettings } from "../../../hooks";
import { formatDateTimeForSettings } from "../../../services/settings/settingsFormatService";
import type { ImportSession, ImportStatus } from "../../../types";

// ─── Helpers ───────────────────────────────────────────────

/** Formate une date ISO en chaîne locale courte. */
function formatDate(
  iso: string,
  settings: ReturnType<typeof useUserSettings>,
): string {
  return formatDateTimeForSettings(iso, settings, iso);
}

/** Badge de statut texte + classe CSS. */
function StatusBadge({ status }: { status: ImportStatus }) {
  const map: Record<
    ImportStatus,
    { cls: string; label: string; icon: React.ReactNode }
  > = {
    analyzed: {
      cls: "import-history__badge--analyzed",
      label: "Analysé",
      icon: <FileText size={10} aria-hidden />,
    },
    pending_confirmation: {
      cls: "import-history__badge--pending",
      label: "En attente",
      icon: <Clock size={10} aria-hidden />,
    },
    imported: {
      cls: "import-history__badge--imported",
      label: "Importé",
      icon: <CheckCircle size={10} aria-hidden />,
    },
    completed: {
      cls: "import-history__badge--imported",
      label: "Importé",
      icon: <CheckCircle size={10} aria-hidden />,
    },
    failed: {
      cls: "import-history__badge--failed",
      label: "Échec",
      icon: <XCircle size={10} aria-hidden />,
    },
    cancelled: {
      cls: "import-history__badge--cancelled",
      label: "Annulé",
      icon: <XCircle size={10} aria-hidden />,
    },
    pending: {
      cls: "import-history__badge--pending",
      label: "En attente",
      icon: <Clock size={10} aria-hidden />,
    },
    in_progress: {
      cls: "import-history__badge--pending",
      label: "En cours",
      icon: <Clock size={10} aria-hidden />,
    },
  };

  const s = map[status] ?? map.pending;
  return (
    <span className={`import-history__badge ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Sessions d'import déjà triées (plus récente en tête). */
  sessions: ImportSession[];
  /** Appelé quand l'utilisateur confirme la suppression d'une session. */
  onDelete: (id: number) => void;
  /** Indique un chargement initial de la liste. */
  loading?: boolean;
}

// ─── Composant principal ────────────────────────────────────

export default function ImportHistoryList({
  sessions,
  onDelete,
  loading = false,
}: Props) {
  const settings = useUserSettings();
  // ID de la session actuellement dépliée (-1 = aucune)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImportSession | null>(null);

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // ── États limites ─────────────────────────────────────

  if (loading) {
    return <p className="import-history__empty">Chargement de l'historique…</p>;
  }

  if (sessions.length === 0) {
    return (
      <p className="import-history__empty">
        Aucun import effectué pour l'instant. Sélectionnez un fichier CSV
        ci-dessus pour commencer.
      </p>
    );
  }

  // ── Liste ───────────────────────────────────────────────

  return (
    <ul className="import-history-list" aria-label="Historique des imports">
      {sessions.map((session) => {
        const isExpanded = expandedId === session.id;

        // Nom d'origine du fichier (retire le préfixe timestamp)
        const displayName = session.filename
          ? session.filename.replace(/^\d+_/, "")
          : "Fichier inconnu";

        return (
          <li key={session.id} className="import-history-item">
            {/* ── Ligne principale ──────────────────────── */}
            <div className="import-history-item__main">
              {/* Bouton d'expansion */}
              <button
                className="import-history-item__expand-btn"
                onClick={() => toggleExpand(session.id)}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Masquer" : "Afficher"} les détails de ${displayName}`}
              >
                {isExpanded ? (
                  <ChevronDown size={14} aria-hidden />
                ) : (
                  <ChevronRight size={14} aria-hidden />
                )}
              </button>

              {/* Infos principales */}
              <div className="import-history-item__info">
                <span
                  className="import-history-item__filename"
                  title={session.filename ?? ""}
                >
                  {displayName}
                </span>

                <div className="import-history-item__meta">
                  <span>{formatDate(session.createdAt, settings)}</span>

                  {/* Broker détecté */}
                  {session.broker && (
                    <>
                      <span className="import-history-item__sep">·</span>
                      <span className="import-history-item__broker">
                        <Cpu size={11} aria-hidden />
                        {session.broker}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Compteurs de lignes (si données disponibles) */}
              {session.totalRows > 0 && (
                <div className="import-history-item__counts">
                  {/* Lignes importables */}
                  <span className="import-history-item__count import-history-item__count--ok">
                    <CheckCircle size={11} aria-hidden />
                    {session.importedRows}
                  </span>

                  {/* Avertissements */}
                  {session.warningRows > 0 && (
                    <span className="import-history-item__count import-history-item__count--warning">
                      <AlertTriangle size={11} aria-hidden />
                      {session.warningRows}
                    </span>
                  )}

                  {/* Invalides */}
                  {session.errorRows > 0 && (
                    <span className="import-history-item__count import-history-item__count--error">
                      <XCircle size={11} aria-hidden />
                      {session.errorRows}
                    </span>
                  )}

                  <span className="import-history-item__total">
                    / {session.totalRows} lignes
                  </span>
                </div>
              )}

              {/* Statut + bouton supprimer */}
              <div className="import-history-item__actions">
                <StatusBadge status={session.status} />

                <button
                  className="btn-ghost import-history-item__del"
                  onClick={() => setDeleteTarget(session)}
                  title="Supprimer cette session"
                  aria-label={`Supprimer la session #${session.id}`}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            </div>

            {/* ── Détails dépliables ────────────────────── */}
            {isExpanded && (
              <div className="import-history-item__details">
                <ImportDetailsPanel session={session} />
              </div>
            )}
          </li>
        );
      })}

      <DeleteDialog
        isOpen={deleteTarget !== null}
        title="Supprimer la session d'import"
        message={`Voulez-vous vraiment supprimer la session d'import ${deleteTarget?.filename ?? `#${deleteTarget?.id ?? ""}`} ? Les lignes brutes et l'historique associé seront supprimés définitivement.`}
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (!deleteTarget) return;
          onDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </ul>
  );
}
