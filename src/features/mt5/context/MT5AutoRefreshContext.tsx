// ============================================================
// Context — MT5AutoRefreshContext
// ============================================================
// Ce contexte déplace la synchronisation automatique MT5 hors de
// MT5SyncPage pour qu'elle continue de fonctionner en arrière-plan,
// quelle que soit la page active.
//
// PROBLÈME résolu :
//   Avant : useMT5AutoRefresh était monté dans MT5SyncPage.
//           Naviguer vers une autre page démontait le composant
//           et stoppait le timer (cleanup automatique du hook).
//
//   Après : useMT5AutoRefresh est monté dans AppLayout via ce contexte.
//           AppLayout ne se démonte jamais → timer actif en permanence.
//
// ARCHITECTURE :
//   <AppLayout>                       ← monte le hook une seule fois
//     <MT5AutoRefreshProvider>        ← fournit le contexte
//       <Outlet />                    ← pages enfants
//         <MT5SyncPage>               ← consomme useMT5AutoRefreshContext()
//
// CALLBACK onSync (fond) :
//   Quand le timer se déclenche, exécute runMT5Sync + notification toast.
//   Pas d'état local à mettre à jour (la page peut être démontée).
//
// CALLBACK onSync (page ouverte) :
//   MT5SyncPage s'abonne à lastSyncAt via useEffect pour recharger
//   ses logs dès qu'une sync fond se termine.
//   Pour les syncs manuelles (bouton), MT5SyncPage appelle handleSync()
//   directement comme avant (met à jour ses états locaux).
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { runMT5Sync } from "../../../services/mt5";
import { useNotification } from "../../../hooks/useNotification";
import {
  useMT5AutoRefresh,
  type UseMT5AutoRefreshReturn,
} from "../../../hooks/useMT5AutoRefresh";

// ─── Contexte ──────────────────────────────────────────────

/**
 * Le contexte expose directement l'objet retourné par useMT5AutoRefresh,
 * plus un flag indiquant si la page MT5 est actuellement montée
 * (pour éviter les doubles toasts quand la page gère déjà les notifs).
 */
interface MT5AutoRefreshContextValue extends UseMT5AutoRefreshReturn {
  /**
   * Permet à MT5SyncPage de signaler qu'elle est montée.
   * Quand true, le callback fond supprime ses toasts (la page
   * affiche les siens avec plus de détails).
   */
  setPageMounted: (mounted: boolean) => void;
}

const MT5AutoRefreshContext = createContext<MT5AutoRefreshContextValue | null>(
  null,
);

// ─── Provider ──────────────────────────────────────────────

interface MT5AutoRefreshProviderProps {
  children: ReactNode;
}

/**
 * Provider à monter dans AppLayout.
 * Instancie useMT5AutoRefresh une seule fois pour toute l'application.
 */
export function MT5AutoRefreshProvider({
  children,
}: MT5AutoRefreshProviderProps) {
  const notify = useNotification();

  // Ref partagée : true si MT5SyncPage est montée et gère ses propres toasts
  const pageMountedRef = useRef(false);

  const setPageMounted = useCallback((mounted: boolean) => {
    pageMountedRef.current = mounted;
  }, []);

  /**
   * Callback de synchronisation en arrière-plan.
   * Appelé par le timer automatique à chaque intervalle.
   * Montre un toast uniquement si MT5SyncPage n'est pas ouverte
   * (pour éviter les doublons — la page affiche ses propres résultats).
   */
  const handleBackgroundSync = useCallback(async () => {
    try {
      const report = await runMT5Sync({ period: "30d" });

      // Ne pas afficher de toast si la page MT5 est ouverte (elle s'en charge)
      if (pageMountedRef.current) return;

      if (!report.success) {
        notify.error(`Sync MT5 échouée : ${report.message}`);
      } else if (report.inserted > 0 || report.updated > 0) {
        notify.success(
          `Sync MT5 : ${report.inserted} trade(s) importé(s), ${report.updated} mis à jour.`,
        );
      }
      // Aucun toast si aucun changement (sync silencieuse)
    } catch {
      if (!pageMountedRef.current) {
        notify.error("Erreur lors de la synchronisation MT5 automatique.");
      }
    }
  }, [notify]);

  const autoRefresh = useMT5AutoRefresh({ onSync: handleBackgroundSync });

  return (
    <MT5AutoRefreshContext.Provider value={{ ...autoRefresh, setPageMounted }}>
      {children}
    </MT5AutoRefreshContext.Provider>
  );
}

// ─── Hook consommateur ─────────────────────────────────────

/**
 * Hook à utiliser dans MT5SyncPage (et partout où l'état de la sync est nécessaire).
 * Retourne null si utilisé hors du provider (ne devrait pas arriver).
 */
export function useMT5AutoRefreshContext(): MT5AutoRefreshContextValue {
  const ctx = useContext(MT5AutoRefreshContext);
  if (ctx === null) {
    throw new Error(
      "useMT5AutoRefreshContext doit être utilisé dans MT5AutoRefreshProvider",
    );
  }
  return ctx;
}
