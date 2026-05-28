// ============================================================
// UI Store — état global de l'interface utilisateur
// ============================================================
// Ce store gère UNIQUEMENT l'état visuel temporaire :
//   - thème actuel (dark / light)
//   - état de la sidebar
//   - état de chargement global
//   - notifications / toasts locaux
//
// ⚠️  Ce store NE remplace PAS SQLite.
//     Les préférences persistantes (ex : thème sauvegardé) doivent
//     être lues depuis la table `settings` au démarrage, puis synchronisées
//     ici pour une réactivité immédiate dans les composants React.
// ============================================================

import { create } from "zustand";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type Theme = "dark" | "light";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  /** Identifiant unique généré localement (non persisté). */
  id: string;
  type: NotificationType;
  message: string;
  /** Durée en ms avant disparition automatique. null = persistent. */
  duration?: number | null;
  /** Horodatage interne pour filtrer les doublons rapprochés. */
  createdAt?: number;
}

// ------------------------------------------------------------
// State interface
// ------------------------------------------------------------

interface UIState {
  // ---- Thème ------------------------------------------------
  /** Thème actif. Synchroniser avec `settings.theme` dans SQLite au démarrage. */
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // ---- Sidebar ---------------------------------------------
  /** Sidebar ouverte ou réduite. */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // ---- Chargement global -----------------------------------
  /** Indicateur de chargement global (ex : import en cours). */
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // ---- Notifications locales (toasts) ----------------------
  /** File de notifications à afficher. Non persistées. */
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

// ------------------------------------------------------------
// Store
// ------------------------------------------------------------

const MAX_NOTIFICATIONS = 5;
const NOTIFICATION_DEDUP_WINDOW_MS = 2_000;

export const useUIStore = create<UIState>()((set) => ({
  // ---- Thème ------------------------------------------------
  theme: "dark",
  setTheme: (theme) => set({ theme }),

  // ---- Sidebar ---------------------------------------------
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // ---- Chargement global -----------------------------------
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),

  // ---- Notifications locales -------------------------------
  notifications: [],

  addNotification: (notification) =>
    set((state) => {
      const now = Date.now();
      const previous = state.notifications[state.notifications.length - 1];

      // Anti-spam simple : ignorer doublon immédiat de même type + message.
      if (
        previous &&
        previous.type === notification.type &&
        previous.message === notification.message &&
        now - (previous.createdAt ?? 0) < NOTIFICATION_DEDUP_WINDOW_MS
      ) {
        return state;
      }

      const nextNotification = {
        ...notification,
        createdAt: now,
        // ID unique léger — non persisté, usage mémoire uniquement
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      };

      const notifications = [...state.notifications, nextNotification];

      return {
        notifications:
          notifications.length > MAX_NOTIFICATIONS
            ? notifications.slice(-MAX_NOTIFICATIONS)
            : notifications,
      };
    }),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));
