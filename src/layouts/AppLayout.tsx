// ============================================================
// AppLayout — Shell principal de l'application desktop
// ============================================================
// Structure complète du shell :
//
//   <div.app-layout>                 ← flex row, pleine hauteur
//     <Sidebar />                    ← colonne gauche, navigation fixe
//     <div.app-shell>                ← colonne droite, flex column
//       <header.app-topbar>          ← slot topbar (vide = hauteur 0)
//       <main.app-content>           ← contenu scrollable, flex:1
//         <Outlet />                 ← page active injectée par le router
//       </main>
//     </div>
//   </div>
//   <div#toast-portal>               ← portal toasts (position: fixed)
//
// ── Ajouter la topbar ──────────────────────────────────────
// Quand le composant <Topbar /> sera prêt (Phase 3, Étape 3) :
//   1. Importer Topbar depuis "../components/layout/Topbar"
//   2. Remplacer le commentaire dans <header> par <Topbar />
//   Les styles CSS (.app-topbar) s'activeront automatiquement.
//
// ── Ajouter des toasts ────────────────────────────────────
// Utiliser ReactDOM.createPortal(content, document.getElementById("toast-portal"))
// depuis le store Zustand ou un hook useToast.
// ============================================================

import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import ToastContainer from "../components/ui/ToastContainer";
import GlobalAlertModal from "../components/ui/GlobalAlertModal";
import { MT5AutoRefreshProvider } from "../features/mt5/context/MT5AutoRefreshContext";

export default function AppLayout() {
  return (
    // MT5AutoRefreshProvider monte le hook useMT5AutoRefresh ici (niveau shell),
    // ce qui garantit que le timer de synchronisation automatique continue de
    // tourner quelle que soit la page active (MT5SyncPage ou non).
    <MT5AutoRefreshProvider>
      <>
        <div className="app-layout">
          {/* Colonne gauche : navigation fixe */}
          <Sidebar />

          {/* Colonne droite : topbar + contenu principal */}
          <div className="app-shell">
            {/* Topbar : titre dynamique de la page active + zone actions */}
            <Topbar />

            {/* Zone de contenu : <Outlet /> est la page active rendue par le router */}
            <main className="app-content">
              <Outlet />
            </main>
          </div>
        </div>

        {/*
         * Portal de toasts — hors du flux normal, position: fixed.
         * ToastContainer lit useUIStore et rend un <Toast> par notification.
         * aria-live="polite" : les nouveaux toasts sont annoncés aux lecteurs d'écran.
         */}
        <div id="toast-portal" aria-live="polite" aria-atomic="false">
          <ToastContainer />
        </div>

        <GlobalAlertModal />
      </>
    </MT5AutoRefreshProvider>
  );
}
