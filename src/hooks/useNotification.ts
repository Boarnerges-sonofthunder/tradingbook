// ============================================================
// useNotification — Hook de notification UI
// ============================================================
// Fournit une API courte pour déclencher des notifications
// depuis n'importe quel composant ou page.
//
// ── Utilisation ───────────────────────────────────────────
//
//   import { useNotification } from "../hooks";
//
//   function MyPage() {
//     const notify = useNotification();
//
//     async function handleSave() {
//       try {
//         await tradesService.createTrade(data);
//         notify.success("Trade enregistré avec succès");
//       } catch (err) {
//         notify.error("Impossible d'enregistrer le trade");
//       }
//     }
//   }
//
// ── API disponible ────────────────────────────────────────
//
//   notify.success(message, duration?)  — 3 secondes par défaut
//   notify.info(message, duration?)     — 3 secondes par défaut
//   notify.warning(message, duration?)  — 5 secondes par défaut
//   notify.error(message, duration?)    — 6 secondes par défaut
//   notify.persist(type, message)       — persistant (fermeture manuelle)
//
//   Le paramètre `duration` est en millisecondes.
//   Passer 0 ou null via persist() pour une notification permanente.
//
// ── Différence avec le logger ─────────────────────────────
//   logger  → diagnostic technique, écrit dans le fichier de log
//             et la console DevTools. Invisible dans l'UI.
//   notify  → information utilisateur, affichée dans le coin
//             supérieur droit de l'application. Non persistée.
//
// ── Lien avec le store ────────────────────────────────────
//   Ce hook est un raccourci vers useUIStore.addNotification.
//   Les durées par défaut et l'API simplifiée sont gérées ici.
// ============================================================

import { useCallback, useMemo } from "react";
import { useUIStore } from "../stores";
import type { NotificationType } from "../types/notification";

// ─── Durées par défaut par type ────────────────────────────

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 3_000,  // 3 s — action confirmée, lecture rapide
  info: 3_000,     // 3 s — information courte
  warning: 5_000,  // 5 s — alerte à lire attentivement
  error: 6_000,    // 6 s — erreur, laisser le temps de réagir
};

// ─── Hook ──────────────────────────────────────────────────

export function useNotification() {
  const addNotification = useUIStore((s) => s.addNotification);

  /** Ajoute une notification avec durée par défaut ou personnalisée. */
  const notify = useCallback(
    (
    type: NotificationType,
    message: string,
    duration?: number,
    ): void => {
      addNotification({
        type,
        message,
        duration: duration ?? DEFAULT_DURATIONS[type],
      });
    },
    [addNotification],
  );

  return useMemo(
    () => ({
      /** Notification de succès — verte, 3 s par défaut. */
      success: (message: string, duration?: number) =>
        notify("success", message, duration),

      /** Notification d'information — bleue, 3 s par défaut. */
      info: (message: string, duration?: number) =>
        notify("info", message, duration),

      /** Notification d'avertissement — orange, 5 s par défaut. */
      warning: (message: string, duration?: number) =>
        notify("warning", message, duration),

      /** Notification d'erreur — rouge, 6 s par défaut. */
      error: (message: string, duration?: number) =>
        notify("error", message, duration),

      /**
       * Notification persistante — l'utilisateur doit la fermer manuellement.
       * Utiliser pour les erreurs critiques ou les imports en cours.
       */
      persist: (type: NotificationType, message: string) =>
        addNotification({ type, message, duration: null }),
    }),
    [addNotification, notify],
  );
}
