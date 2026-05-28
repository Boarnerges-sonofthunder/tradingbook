// ============================================================
// Toast — Composant de notification individuelle
// ============================================================
// Affiche une seule notification avec :
//   - icône sémantique (succès / erreur / info / avertissement)
//   - message textuel
//   - bouton de fermeture manuelle
//   - fermeture automatique après `duration` ms (si définie)
//
// ── Auto-dismiss ──────────────────────────────────────────
// Si `duration` est un nombre, un setTimeout ferme le toast
// automatiquement. Passer `duration: null` pour une notification
// persistante que l'utilisateur doit fermer manuellement.
//
// ── Accessibilité ─────────────────────────────────────────
// - success/info : role="status"  (aria-live="polite"  implicite)
// - error/warning : role="alert" (aria-live="assertive" implicite)
// Les deux sont dans la zone aria-live="polite" du portal,
// mais `role="alert"` force l'annonce immédiate par les
// lecteurs d'écran pour les messages urgents.
//
// ── Utilisation ───────────────────────────────────────────
// Ne pas utiliser directement — passer par useNotification() :
//   const { success, error } = useNotification();
//   success("Trade enregistré");
//   error("Erreur de connexion SQLite");
// ============================================================

import { useEffect } from "react";
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";
import type { Notification } from "../../types/notification";

// ─── Types ─────────────────────────────────────────────────

interface ToastProps {
  notification: Notification;
  /** Appelé quand le toast doit disparaître (timeout ou clic). */
  onDismiss: (id: string) => void;
}

// ─── Icônes et rôles ARIA par type ─────────────────────────

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle,
    role: "status" as const,
    label: "Succès",
  },
  error: {
    icon: XCircle,
    role: "alert" as const,
    label: "Erreur",
  },
  info: {
    icon: Info,
    role: "status" as const,
    label: "Information",
  },
  warning: {
    icon: AlertTriangle,
    role: "alert" as const,
    label: "Avertissement",
  },
} as const;

// ─── Composant ─────────────────────────────────────────────

export default function Toast({ notification, onDismiss }: ToastProps) {
  const { id, type, message, duration } = notification;
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  // Auto-dismiss : déclenche onDismiss après `duration` ms.
  // Si duration est null ou undefined, le toast est persistant.
  useEffect(() => {
    if (duration === null || duration === undefined) return;

    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    // Nettoyage : annule le timer si le composant est démonté
    // avant l'expiration (ex : fermeture manuelle).
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      className={`toast toast--${type}`}
      role={config.role}
      aria-label={config.label}
    >
      {/* Icône sémantique */}
      <Icon
        size={16}
        className={`toast-icon toast-icon--${type}`}
        aria-hidden
      />

      {/* Corps du message */}
      <p className="toast-body">
        <span className="toast-message">{message}</span>
      </p>

      {/* Bouton de fermeture manuelle */}
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => onDismiss(id)}
        aria-label="Fermer la notification"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
