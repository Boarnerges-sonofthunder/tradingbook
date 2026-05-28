import { Clock, Database, HardDrive } from "lucide-react";
import { useUserSettings } from "../../../hooks";
import {
  formatDateTimeForSettings,
  formatNumberForSettings,
} from "../../../services/settings/settingsFormatService";
import type { Backup } from "../../../types";

interface BackupsListProps {
  backups: Backup[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (backup: Backup) => void;
}

function formatBackupSize(
  bytes: number | null,
  settings: ReturnType<typeof useUserSettings>,
): string {
  if (bytes === null) return "Taille inconnue";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) {
    return `${formatNumberForSettings(bytes / 1024, settings, {
      maximumFractionDigits: 1,
    })} Ko`;
  }
  return `${formatNumberForSettings(bytes / (1024 * 1024), settings, {
    maximumFractionDigits: 1,
  })} Mo`;
}

function getTriggerLabel(trigger: Backup["trigger"]): string {
  switch (trigger) {
    case "auto":
      return "Automatique";
    case "pre_import":
      return "Avant import";
    case "pre_migration":
      return "Avant migration";
    case "manual":
    default:
      return "Manuel";
  }
}

export default function BackupsList({
  backups,
  selectedId,
  loading,
  onSelect,
}: BackupsListProps) {
  const settings = useUserSettings();

  if (loading) {
    return <p className="backups-empty">Chargement des backups…</p>;
  }

  if (backups.length === 0) {
    return (
      <div className="backups-empty">
        <Database size={18} aria-hidden />
        <span>Aucun backup local enregistré pour le moment.</span>
      </div>
    );
  }

  return (
    <div className="backups-list" role="list">
      {backups.map((backup) => {
        const isSelected = backup.id === selectedId;

        return (
          <button
            key={backup.id}
            type="button"
            className={`backup-row${isSelected ? " backup-row--selected" : ""}`}
            onClick={() => onSelect(backup)}
            role="listitem"
          >
            <span className="backup-row__icon" aria-hidden>
              <Database size={16} />
            </span>
            <span className="backup-row__main">
              <span className="backup-row__filename">{backup.filename}</span>
              <span className="backup-row__meta">
                <Clock size={13} aria-hidden />
                {formatDateTimeForSettings(backup.createdAt, settings)}
                <HardDrive size={13} aria-hidden />
                {formatBackupSize(backup.sizeBytes, settings)}
              </span>
            </span>
            <span className="badge badge-neutral">
              {getTriggerLabel(backup.trigger)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
