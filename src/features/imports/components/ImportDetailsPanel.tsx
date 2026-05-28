// ============================================================
// ImportDetailsPanel — Détails d'une session d'import
// ============================================================
// Phase 5 Étape 8 — Historique des imports CSV.
//
// Affiche le détail complet d'une session d'import :
//   - Informations du fichier (nom, taille, date)
//   - Broker détecté
//   - Compteurs de lignes (total, importables, invalides, warnings)
//   - Statut avec badge coloré
//   - Message d'erreur (si échec)
//
// Usage :
//   <ImportDetailsPanel session={session} />
//
// Ce composant est purement affichant — aucun I/O, aucun side-effect.
// ============================================================

import {
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Cpu,
  Hash,
  CalendarDays,
  HardDrive,
  SkipForward,
} from "lucide-react";
import type { ImportSession, ImportStatus } from "../../../types";

// ─── Helpers ───────────────────────────────────────────────

/** Formate une taille en octets en Ko/Mo lisibles. */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Formate une date ISO en chaîne locale courte. */
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Métadonnées visuelles pour chaque statut. */
function statusMeta(status: ImportStatus): {
  icon: React.ReactNode;
  label: string;
  cls: string;
} {
  switch (status) {
    case "analyzed":
      return {
        icon: <FileText size={12} aria-hidden />,
        label: "Analysé",
        cls: "import-details__status--analyzed",
      };
    case "pending_confirmation":
      return {
        icon: <Clock size={12} aria-hidden />,
        label: "En attente",
        cls: "import-details__status--pending",
      };
    case "imported":
    case "completed":
      return {
        icon: <CheckCircle size={12} aria-hidden />,
        label: "Importé",
        cls: "import-details__status--imported",
      };
    case "failed":
      return {
        icon: <XCircle size={12} aria-hidden />,
        label: "Échec",
        cls: "import-details__status--failed",
      };
    case "cancelled":
      return {
        icon: <XCircle size={12} aria-hidden />,
        label: "Annulé",
        cls: "import-details__status--cancelled",
      };
    default:
      return {
        icon: <Clock size={12} aria-hidden />,
        label: status,
        cls: "import-details__status--pending",
      };
  }
}

// ─── Sous-composant : une ligne de détail ──────────────────

function DetailRow({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`import-details__row ${className ?? ""}`}>
      <span className="import-details__row-icon">{icon}</span>
      <span className="import-details__row-label">{label}</span>
      <span className="import-details__row-value">{value}</span>
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────

interface Props {
  /** Session d'import à afficher. */
  session: ImportSession;
}

// ─── Composant principal ────────────────────────────────────

export default function ImportDetailsPanel({ session }: Props) {
  const meta = statusMeta(session.status);

  // Taux de succès : lignes importables / total
  const pctOk =
    session.totalRows > 0
      ? Math.round((session.importedRows / session.totalRows) * 100)
      : null;

  // Afficher le nom d'origine du fichier (avant le préfixe timestamp)
  // Format stocké : {timestamp}_{nom_original.csv}
  const displayName = session.filename
    ? session.filename.replace(/^\d+_/, "")
    : "—";

  return (
    <div className="import-details">
      {/* ── En-tête : nom + statut ──────────────────────── */}
      <div className="import-details__header">
        <FileText size={14} className="import-details__file-icon" aria-hidden />
        <span
          className="import-details__filename"
          title={session.filename ?? ""}
        >
          {displayName}
        </span>
        <span className={`import-details__status ${meta.cls}`}>
          {meta.icon}
          {meta.label}
        </span>
      </div>

      {/* ── Grille de détails ───────────────────────────── */}
      <div className="import-details__grid">
        {/* Dates */}
        <DetailRow
          icon={<CalendarDays size={12} aria-hidden />}
          label="Créé le"
          value={formatDate(session.createdAt)}
        />
        {(session.status === "imported" || session.status === "completed") &&
          session.importedAt && (
            <DetailRow
              icon={<CheckCircle size={12} aria-hidden />}
              label="Importé le"
              value={formatDate(session.importedAt)}
            />
          )}

        {/* Fichier */}
        <DetailRow
          icon={<HardDrive size={12} aria-hidden />}
          label="Taille du fichier"
          value={formatBytes(session.fileSizeBytes)}
        />

        {/* Broker */}
        {session.broker && (
          <DetailRow
            icon={<Cpu size={12} aria-hidden />}
            label="Format broker"
            value={session.broker}
          />
        )}

        {/* Session ID */}
        <DetailRow
          icon={<Hash size={12} aria-hidden />}
          label="Session #"
          value={session.id}
        />

        {/* ── Compteurs de lignes ─────────────────────── */}
        {session.totalRows > 0 && (
          <>
            <div className="import-details__divider" />

            <DetailRow
              icon={<FileText size={12} aria-hidden />}
              label="Lignes totales"
              value={session.totalRows}
            />

            <DetailRow
              icon={<CheckCircle size={12} aria-hidden />}
              label={
                session.status === "analyzed" ||
                session.status === "pending_confirmation"
                  ? "Importables"
                  : "Importées"
              }
              value={
                <span className="import-details__count import-details__count--ok">
                  {session.importedRows}
                  {pctOk !== null && (
                    <span className="import-details__count-pct">{pctOk} %</span>
                  )}
                </span>
              }
            />

            {session.warningRows > 0 && (
              <DetailRow
                icon={<AlertTriangle size={12} aria-hidden />}
                label="Avec avertissements"
                value={
                  <span className="import-details__count import-details__count--warning">
                    {session.warningRows}
                  </span>
                }
              />
            )}

            {session.errorRows > 0 && (
              <DetailRow
                icon={<XCircle size={12} aria-hidden />}
                label="Invalides (exclues)"
                value={
                  <span className="import-details__count import-details__count--error">
                    {session.errorRows}
                  </span>
                }
              />
            )}

            {session.skippedRows > 0 && (
              <DetailRow
                icon={<SkipForward size={12} aria-hidden />}
                label="Ignorées"
                value={session.skippedRows}
              />
            )}
          </>
        )}
      </div>

      {/* ── Message d'erreur (si échec) ─────────────────── */}
      {session.status === "failed" && session.errorMessage && (
        <div className="import-details__error-msg" role="alert">
          <XCircle size={13} aria-hidden />
          <span>{session.errorMessage}</span>
        </div>
      )}
    </div>
  );
}
