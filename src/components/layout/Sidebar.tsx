// ============================================================
// Sidebar — Navigation principale de l'application desktop
// ============================================================
// Composant fixe, affiché sur toute la hauteur de l'application.
// Divisé en 3 sections : Principal, Outils, Système.
//
// Pour ajouter un nouvel item :
//   1. Importer l'icône Lucide souhaitée.
//   2. Ajouter une entrée dans la section appropriée de NAV_SECTIONS.
//   3. S'assurer que la route correspondante existe dans ROUTES et router.tsx.
// ============================================================

import {
  LayoutDashboard,
  BookOpen,
  Film,
  PlusCircle,
  BarChart2,
  LineChart,
  CalendarDays,
  Upload,
  RefreshCw,
  Target,
  Wallet,
  Camera,
  Database,
  FileText,
  Settings,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ROUTES } from "../../constants/routes";
import { useUserSettings } from "../../hooks";
import { t } from "../../utils/i18n";
import SidebarItem from "./SidebarItem";

// ─── Définition des sections de navigation ─────────────────

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** true = correspondance exacte de la route (évite les faux positifs) */
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

function getNavSections(language: "fr" | "en"): NavSection[] {
  return [
    {
      label: t(language, "sidebar_section_main"),
      items: [
        {
          to: ROUTES.DASHBOARD,
          icon: LayoutDashboard,
          label: t(language, "nav_dashboard"),
          // end=true : actif uniquement sur "/" et pas sur "/trades", "/analytics"…
          end: true,
        },
        {
          to: ROUTES.TRADES,
          icon: BookOpen,
          label: t(language, "nav_trades_journal"),
          // end=true : actif sur "/trades" mais pas sur "/trades/new" ni "/trades/:id"
          end: true,
        },
        {
          to: ROUTES.REPLAY,
          icon: Film,
          label: t(language, "nav_replay_trades"),
        },
        {
          to: ROUTES.TRADE_NEW,
          icon: PlusCircle,
          label: t(language, "nav_new_trade"),
        },
        {
          to: ROUTES.ANALYTICS,
          icon: BarChart2,
          label: t(language, "nav_analytics"),
        },
        {
          to: ROUTES.BACKTESTING,
          icon: LineChart,
          label: t(language, "nav_backtesting"),
        },
        {
          to: ROUTES.CALENDAR,
          icon: CalendarDays,
          label: t(language, "nav_calendar"),
        },
      ],
    },
    {
      label: t(language, "sidebar_section_tools"),
      items: [
        {
          to: ROUTES.IMPORTS,
          icon: Upload,
          label: t(language, "nav_import_csv"),
        },
        {
          to: ROUTES.MT5_SYNC,
          icon: RefreshCw,
          label: t(language, "nav_sync_mt5"),
        },
        {
          to: ROUTES.STRATEGIES,
          icon: Target,
          label: t(language, "nav_strategies"),
        },
        {
          to: ROUTES.ACCOUNTS,
          icon: Wallet,
          label: t(language, "nav_accounts"),
        },
        {
          to: ROUTES.SCREENSHOTS,
          icon: Camera,
          label: t(language, "nav_screenshots"),
        },
      ],
    },
    {
      label: t(language, "sidebar_section_system"),
      items: [
        {
          to: ROUTES.BACKUPS,
          icon: Database,
          label: t(language, "nav_backups"),
        },
        {
          to: ROUTES.LOGS,
          icon: FileText,
          label: t(language, "nav_system_logs"),
        },
        {
          to: ROUTES.SETTINGS,
          icon: Settings,
          label: t(language, "nav_settings"),
        },
      ],
    },
  ];
}

// ─── Composant ─────────────────────────────────────────────

export default function Sidebar() {
  const { language } = useUserSettings();
  const navSections = getNavSections(language);

  return (
    <aside
      className="sidebar"
      role="navigation"
      aria-label={t(language, "sidebar_nav_aria")}
    >
      {/* Logo / nom de l'application */}
      <div className="sidebar-logo">
        <TrendingUp
          className="sidebar-logo-icon"
          size={20}
          strokeWidth={2}
          aria-hidden
        />
        <span className="sidebar-logo-text">TradingBook</span>
      </div>

      {/* Sections de navigation */}
      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.label} className="sidebar-section">
            <p className="sidebar-section-label">{section.label}</p>

            {section.items.map((item) => (
              <SidebarItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                end={item.end}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Pied de sidebar : version */}
      <div className="sidebar-footer">v0.1.0 — local</div>
    </aside>
  );
}
