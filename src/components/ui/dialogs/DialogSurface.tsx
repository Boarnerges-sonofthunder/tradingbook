import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogSurfaceProps {
  isOpen: boolean;
  title: string;
  titleId: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  icon?: ReactNode;
  loading?: boolean;
}

// Socle commun pour tous les dialogues desktop TradingBook.
// Unifie backdrop, carte, fermeture ESC et clic hors contenu.
export default function DialogSurface({
  isOpen,
  title,
  titleId,
  children,
  footer,
  onClose,
  icon,
  loading = false,
}: DialogSurfaceProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="confirm-dialog__header">
          <div className="dialog-surface__title-wrap">
            {icon && (
              <span className="dialog-surface__icon" aria-hidden>
                {icon}
              </span>
            )}
            <h2 className="confirm-dialog__title" id={titleId}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="btn-ghost confirm-dialog__close"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="confirm-dialog__body">{children}</div>

        <div className="confirm-dialog__footer">{footer}</div>
      </div>
    </div>
  );
}
