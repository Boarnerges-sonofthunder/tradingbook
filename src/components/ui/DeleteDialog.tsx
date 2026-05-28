import ConfirmDialog from "./ConfirmDialog";

interface DeleteDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Variante destructrice standard.
// Même socle que ConfirmDialog, avec langage par défaut orienté suppression.
export default function DeleteDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Supprimer",
  loading = false,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      cancelLabel="Annuler"
      danger
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
