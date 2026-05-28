import { AlertTriangle, RotateCcw } from "lucide-react";
import DialogSurface from "../../../components/ui/dialogs/DialogSurface";
import { useUserSettings } from "../../../hooks";
import {
  formatDateTimeForSettings,
  formatNumberForSettings,
} from "../../../services/settings/settingsFormatService";
import type { BackupRestoreDetails } from "../../../services/backups";

interface RestoreBackupDialogProps {
  details: BackupRestoreDetails | null;
  confirmationText: string;
  restoring: boolean;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const REQUIRED_CONFIRMATION = "RESTAURER";

function formatBackupSize(
  bytes: number | null,
  settings: ReturnType<typeof useUserSettings>,
): string {
  if (bytes === null) return "Non disponible";
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

export { REQUIRED_CONFIRMATION };

export default function RestoreBackupDialog({
  details,
  confirmationText,
  restoring,
  onConfirmationChange,
  onCancel,
  onConfirm,
}: RestoreBackupDialogProps) {
  const settings = useUserSettings();

  if (!details) return null;

  const canConfirm =
    details.exists &&
    confirmationText.trim().toUpperCase() === REQUIRED_CONFIRMATION;

  return (
    <DialogSurface
      isOpen={Boolean(details)}
      title="Restaurer un backup"
      titleId="backup-restore-title"
      icon={<AlertTriangle size={18} />}
      loading={restoring}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={restoring}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn-danger btn-icon-text"
            onClick={onConfirm}
            disabled={!canConfirm || restoring}
          >
            <RotateCcw size={15} aria-hidden />
            {restoring ? "Restauration…" : "Restaurer"}
          </button>
        </>
      }
    >
      <div className="backup-restore-dialog__body">
        <p>
          Cette action remplacera la base SQLite actuelle. Un backup de sécurité
          sera créé automatiquement avant la restauration.
        </p>

        <dl className="backup-details">
          <div>
            <dt>Fichier</dt>
            <dd>{details.filename}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{details.format === "zip" ? "ZIP" : "SQLite .db"}</dd>
          </div>
          <div>
            <dt>Taille</dt>
            <dd>{formatBackupSize(details.sizeBytes, settings)}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDateTimeForSettings(details.createdAt, settings)}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{details.version ?? "Non disponible"}</dd>
          </div>
        </dl>

        {!details.exists && (
          <p className="backup-restore-dialog__warning">
            Le fichier physique de ce backup est introuvable sur le disque.
          </p>
        )}

        <label className="form-group">
          <span className="form-label">
            Tapez {REQUIRED_CONFIRMATION} pour confirmer
          </span>
          <input
            type="text"
            value={confirmationText}
            onChange={(event) => onConfirmationChange(event.target.value)}
            disabled={restoring || !details.exists}
            autoFocus
          />
        </label>
      </div>
    </DialogSurface>
  );
}
