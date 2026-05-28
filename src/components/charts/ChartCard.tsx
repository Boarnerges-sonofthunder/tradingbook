// ============================================================
// Composant - ChartCard
// ============================================================
// Conteneur reutilisable pour les visualisations analytics.
// Il fournit un shell coherent : titre, description, actions et zone de rendu.
// ============================================================

import type { ReactNode } from "react";
import clsx from "clsx";

interface ChartCardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export default function ChartCard({
  title,
  description,
  actions,
  footer,
  className,
  bodyClassName,
  children,
}: ChartCardProps) {
  const hasHeader = title || description || actions;

  return (
    <section className={clsx("chart-card", className)}>
      {hasHeader && (
        <header className="chart-card__header">
          <div className="chart-card__heading">
            {title && <h3 className="chart-card__title">{title}</h3>}
            {description && (
              <p className="chart-card__description">{description}</p>
            )}
          </div>

          {actions && <div className="chart-card__actions">{actions}</div>}
        </header>
      )}

      <div className={clsx("chart-card__body", bodyClassName)}>{children}</div>

      {footer && <footer className="chart-card__footer">{footer}</footer>}
    </section>
  );
}
