// ============================================================
// Composant - EmptyChartState
// ============================================================
// Etat vide professionnel pour les visualisations analytics.
// Les composants graphiques restent responsables de l'afficher,
// mais ne recalculent jamais les donnees.
// ============================================================

import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import clsx from "clsx";

interface EmptyChartStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export default function EmptyChartState({
  title,
  description,
  icon,
  className,
}: EmptyChartStateProps) {
  return (
    <div className={clsx("chart-empty-state", className)}>
      <div className="chart-empty-state__icon" aria-hidden>
        {icon ?? <BarChart3 size={22} strokeWidth={1.5} />}
      </div>
      <div className="chart-empty-state__content">
        <p className="chart-empty-state__title">{title}</p>
        {description && (
          <p className="chart-empty-state__description">{description}</p>
        )}
      </div>
    </div>
  );
}
