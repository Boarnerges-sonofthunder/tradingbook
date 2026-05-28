import { AlertTriangle, RotateCcw } from "lucide-react";
import DialogSurface from "./dialogs/DialogSurface";

interface CriticalErrorDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onReload: () => void;
}

// Dialogue de panne critique.
// Utilisé pour bloquer l'écran quand l'UI ne peut plus continuer.
export default function CriticalErrorDialog({
  isOpen,
  title,
  message,
  onReload,
}: CriticalErrorDialogProps) {
  return (
    <DialogSurface
      isOpen={isOpen}
      title={title}
      titleId="critical-error-dialog-title"
      icon={<AlertTriangle size={18} />}
      onClose={onReload}
      footer={
        <button
          type="button"
          className="btn-danger btn-icon-text"
          onClick={onReload}
        >
          <RotateCcw size={14} aria-hidden />
          Recharger l'application
        </button>
      }
    >
      <p className="confirm-dialog__body">{message}</p>
    </DialogSurface>
  );
}
