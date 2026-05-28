// ============================================================
// Composant - ChartTooltip
// ============================================================
// Tooltip visuel commun pour les charts Recharts.
// Les donnees y sont deja formatees par le graphique appelant.
// ============================================================

import type { ReactNode } from "react";
import clsx from "clsx";

export interface ChartTooltipRow {
  label: string;
  value: ReactNode;
  tone?: "default" | "positive" | "negative" | "accent" | "warning";
}

interface ChartTooltipProps {
  title?: ReactNode;
  rows: ChartTooltipRow[];
  footer?: ReactNode;
  className?: string;
}

export default function ChartTooltip({
  title,
  rows,
  footer,
  className,
}: ChartTooltipProps) {
  return (
    <div className={clsx("chart-tooltip", className)}>
      {title && <div className="chart-tooltip__title">{title}</div>}

      <div className="chart-tooltip__rows">
        {rows.map((row) => (
          <div key={row.label} className="chart-tooltip__row">
            <span className="chart-tooltip__label">{row.label}</span>
            <strong
              className={clsx(
                "chart-tooltip__value",
                row.tone && `chart-tooltip__value--${row.tone}`,
              )}
            >
              {row.value}
            </strong>
          </div>
        ))}
      </div>

      {footer && <div className="chart-tooltip__footer">{footer}</div>}
    </div>
  );
}
