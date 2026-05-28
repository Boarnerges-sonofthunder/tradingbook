// ============================================================
// Topbar — Barre supérieure de l'application desktop
// ============================================================
// Affiche dynamiquement le titre et la description de la page
// active, détectés via useLocation / useMatch.
//
// Structure :
//   <header.app-topbar>
//     <div.topbar-inner>
//       <div.topbar-page-info>    ← titre + description (gauche)
//       <div.topbar-actions>      ← actions rapides futures (droite)
//
// ── Ajouter des actions rapides ───────────────────────────
// Dans la zone <div.topbar-actions>, ajouter des boutons contextuels.
// Ex :
//   <button className="topbar-btn" onClick={...}>
//     <Plus size={15} /> Nouveau trade
//   </button>
//
// ── Titre de page ──────────────────────────────────────────
// Le titre est résolu par usePageMeta() :
//   1. Correspondance exacte dans PAGE_META (routes statiques)
//   2. Correspondance par pattern pour /trades/:id (route dynamique)
//   3. Fallback vers DEFAULT_META
// Pour ajouter une nouvelle page : ajouter une entrée dans PAGE_META.
// ============================================================

import { useLocation, useMatch } from "react-router-dom";
import { ROUTES } from "../../constants/routes";
import { useUserSettings } from "../../hooks";
import { t } from "../../utils/i18n";
import GlobalSearchInput from "../../features/search/components/GlobalSearchInput";

// ─── Types ─────────────────────────────────────────────────

interface PageMeta {
  title: string;
  /** Description courte affichée à droite du titre. Optionnelle. */
  description?: string;
}

// ─── Métadonnées par route ─────────────────────────────────
// Clé = pathname exact (ex : "/trades").
// ROUTES.TRADE_DETAILS ("/trades/:id") est absent : géré par useMatch ci-dessous.

const DEFAULT_META: PageMeta = { title: "TradingBook" };

function getPageMeta(language: "fr" | "en"): Record<string, PageMeta> {
  return {
    [ROUTES.DASHBOARD]: {
      title: t(language, "page_dashboard_title"),
      description: t(language, "page_dashboard_desc"),
    },
    [ROUTES.TRADES]: {
      title: t(language, "page_trades_title"),
      description: t(language, "page_trades_desc"),
    },
    [ROUTES.REPLAY]: {
      title: t(language, "page_replay_title"),
      description: t(language, "page_replay_desc"),
    },
    [ROUTES.TRADE_NEW]: {
      title: t(language, "page_new_trade_title"),
      description: t(language, "page_new_trade_desc"),
    },
    [ROUTES.ANALYTICS]: {
      title: t(language, "page_analytics_title"),
      description: t(language, "page_analytics_desc"),
    },
    [ROUTES.BACKTESTING]: {
      title: t(language, "page_backtesting_title"),
      description: t(language, "page_backtesting_desc"),
    },
    [ROUTES.CALENDAR]: {
      title: t(language, "page_calendar_title"),
      description: t(language, "page_calendar_desc"),
    },
    [ROUTES.IMPORTS]: {
      title: t(language, "page_imports_title"),
      description: t(language, "page_imports_desc"),
    },
    [ROUTES.MT5_SYNC]: {
      title: t(language, "page_mt5_title"),
      description: t(language, "page_mt5_desc"),
    },
    [ROUTES.STRATEGIES]: {
      title: t(language, "page_strategies_title"),
      description: t(language, "page_strategies_desc"),
    },
    [ROUTES.SCREENSHOTS]: {
      title: t(language, "page_screenshots_title"),
      description: t(language, "page_screenshots_desc"),
    },
    [ROUTES.BACKUPS]: {
      title: t(language, "page_backups_title"),
      description: t(language, "page_backups_desc"),
    },
    [ROUTES.LOGS]: {
      title: t(language, "page_logs_title"),
      description: t(language, "page_logs_desc"),
    },
    [ROUTES.SETTINGS]: {
      title: t(language, "page_settings_title"),
      description: t(language, "page_settings_desc"),
    },
  };
}

// ─── Hook : résolution du titre de page ────────────────────

function usePageMeta(language: "fr" | "en"): PageMeta {
  const { pathname } = useLocation();
  const pageMeta = getPageMeta(language);

  // Route dynamique /trades/:id — useMatch doit être appelé inconditionnellement.
  // On l'appelle avant toute décision, conformément aux règles des hooks React.
  const tradeDetailMatch = useMatch(ROUTES.TRADE_DETAILS);

  // 1. Correspondance exacte (couvre toutes les routes statiques, y compris /trades/new)
  if (Object.prototype.hasOwnProperty.call(pageMeta, pathname)) {
    return pageMeta[pathname];
  }

  // 2. Route dynamique /trades/:id (ex : /trades/42)
  if (tradeDetailMatch !== null) {
    return {
      title: t(language, "page_trade_details_title"),
      description: t(language, "page_trade_details_desc"),
    };
  }

  // 3. Fallback
  return DEFAULT_META;
}

// ─── Composant ─────────────────────────────────────────────

export default function Topbar() {
  const { language } = useUserSettings();
  const { title, description } = usePageMeta(language);

  return (
    <header className="app-topbar" aria-label={t(language, "topbar_aria")}>
      <div className="topbar-inner">
        {/* Zone gauche : titre et description de la page active */}
        <div className="topbar-page-info">
          <p className="topbar-title">{title}</p>
          {description !== undefined && (
            <span className="topbar-description">{description}</span>
          )}
        </div>

        {/* Zone droite : actions rapides et statuts système futurs
         *
         * Actions — Phase 3, Étape 4 :
         *   <button className="topbar-btn">+ Nouveau trade</button>
         *
         * Statuts système — Phase suivante :
         *   <span className="topbar-status">MT5 : connecté</span>
         */}
        <div className="topbar-actions">
          <GlobalSearchInput />
        </div>
      </div>
    </header>
  );
}
