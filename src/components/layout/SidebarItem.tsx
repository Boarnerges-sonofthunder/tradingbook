// ============================================================
// SidebarItem — Lien de navigation individuel
// ============================================================
// Utilise NavLink de react-router-dom pour détecter
// automatiquement l'état actif selon la route courante.
//
// Props :
//   to    — chemin de destination (depuis ROUTES)
//   icon  — composant Lucide à afficher
//   label — libellé textuel
//   end   — si true, l'état actif exige une correspondance exacte
//           (utile pour "/" et "/trades" pour éviter les faux positifs)
// ============================================================

import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  /** Route de destination (ex : ROUTES.DASHBOARD) */
  to: string;
  /** Icône Lucide à afficher à gauche du label */
  icon: LucideIcon;
  /** Libellé visible dans la sidebar */
  label: string;
  /**
   * Si true, l'état actif ne s'applique que sur la correspondance exacte.
   * À utiliser pour les routes parentes (ex : "/" et "/trades")
   * afin qu'elles ne soient pas actives sur leurs sous-routes.
   */
  end?: boolean;
}

export default function SidebarItem({
  to,
  icon: Icon,
  label,
  end = false,
}: SidebarItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      // NavLink fournit { isActive } pour décider de la classe CSS
      className={({ isActive }) =>
        isActive ? "sidebar-item sidebar-item--active" : "sidebar-item"
      }
    >
      <Icon
        className="sidebar-item-icon"
        size={16}
        strokeWidth={1.8}
        aria-hidden
      />
      <span>{label}</span>
    </NavLink>
  );
}
