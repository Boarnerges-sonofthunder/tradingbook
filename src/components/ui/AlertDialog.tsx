import { AlertTriangle } from "lucide-react";
import DialogSurface from "./dialogs/DialogSurface";

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  criteria?: string[];
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

// Dialogue d'alerte non destructif.
// Sert pour messages importants qui doivent être lus avant action.
export default function AlertDialog({
  isOpen,
  title,
  message,
  criteria,
  confirmLabel = "Fermer",
  onConfirm,
  onClose,
}: AlertDialogProps) {
  return (
    <DialogSurface
      isOpen={isOpen}
      title={title}
      titleId="alert-dialog-title"
      icon={<AlertTriangle size={18} />}
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
      }
    >
      <p className="confirm-dialog__body">{message}</p>
      {criteria && criteria.length > 0 ? (
        <ul className="alert-dialog__criteria-list">
          {criteria.map((criterion, index) => (
            <li
              key={`${criterion}-${index}`}
              className="alert-dialog__criteria-item"
            >
              {criterion}
            </li>
          ))}
        </ul>
      ) : null}
    </DialogSurface>
  );
}
