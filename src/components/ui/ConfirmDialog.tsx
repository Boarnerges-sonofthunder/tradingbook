// ============================================================
// ConfirmDialog — Dialogue de confirmation générique
// ============================================================
// Affiche une modale bloquante avec un message et deux boutons :
// Confirmer / Annuler. Utilisé notamment pour la suppression d'un trade.
//
// Usage :
//   <ConfirmDialog
//     isOpen={showDialog}
//     title="Supprimer le trade"
//     message="Cette action est irréversible."
//     confirmLabel="Supprimer"
//     danger
//     loading={deleting}
//     onConfirm={handleDelete}
//     onCancel={() => setShowDialog(false)}
//   />
// ============================================================

import DialogSurface from "./dialogs/DialogSurface";

export interface ConfirmDialogProps {
  /** Contrôle la visibilité du dialogue. */
  isOpen: boolean;
  /** Titre affiché en haut du dialogue. */
  title: string;
  /** Corps du message explicatif. */
  message: string;
  /** Label du bouton de confirmation (défaut : "Confirmer"). */
  confirmLabel?: string;
  /** Label du bouton d'annulation (défaut : "Annuler"). */
  cancelLabel?: string;
  /** Si true, le bouton de confirmation est rouge (action destructrice). */
  danger?: boolean;
  /** Désactive les boutons et affiche un état de chargement. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <DialogSurface
      isOpen={isOpen}
      title={title}
      titleId="confirm-dialog-title"
      onClose={onCancel}
      loading={loading}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "En cours…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-dialog__body">{message}</p>
    </DialogSurface>
  );
}
