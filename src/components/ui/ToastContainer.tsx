// ============================================================
// ToastContainer — Rendu de la file des notifications actives
// ============================================================
// Lit les notifications depuis useUIStore et affiche un <Toast>
// par notification dans la zone #toast-portal (AppLayout.tsx).
//
// Ce composant est rendu directement à l'intérieur de #toast-portal
// (position: fixed, coin supérieur droit). Il n'utilise pas
// createPortal car le portal DOM est géré par AppLayout.
//
// Renvoie null si aucune notification n'est active — le
// #toast-portal reste présent dans le DOM mais invisible,
// prêt à recevoir de nouvelles notifications immédiatement.
//
// ── Ajout de ce composant ─────────────────────────────────
// Il est déjà inclus dans AppLayout.tsx :
//   <div id="toast-portal" aria-live="polite" aria-atomic="false">
//     <ToastContainer />
//   </div>
//
// ── Déclencher une notification ───────────────────────────
// Dans n'importe quel composant ou page :
//   import { useNotification } from "../../hooks";
//   const notify = useNotification();
//   notify.success("Trade enregistré avec succès");
//   notify.error("Impossible d'ouvrir la base de données");
// ============================================================

import { useUIStore } from "../../stores";
import Toast from "./Toast";

export default function ToastContainer() {
  const notifications = useUIStore((s) => s.notifications);
  const removeNotification = useUIStore((s) => s.removeNotification);

  // Aucune notification : on ne rend rien (le portal reste propre)
  if (notifications.length === 0) return null;

  return (
    <>
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={removeNotification}
        />
      ))}
    </>
  );
}
