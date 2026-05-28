import { AlertTriangle } from "lucide-react";
import DialogSurface from "./dialogs/DialogSurface";

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
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
    </DialogSurface>
  );
}
