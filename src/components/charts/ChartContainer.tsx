// ============================================================
// Composant - ChartContainer
// ============================================================
// Zone de rendu stable pour Recharts ou Lightweight Charts.
// On fixe une hauteur explicite pour eviter les sauts de layout.
// ============================================================

import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

interface ChartContainerProps {
  children: ReactNode;
  height?: number | string;
  minHeight?: number | string;
  className?: string;
}

export default function ChartContainer({
  children,
  height = 320,
  minHeight = 280,
  className,
}: ChartContainerProps) {
  const style: CSSProperties = {
    height,
    minHeight,
  };

  return (
    <div className={clsx("chart-container", className)} style={style}>
      {children}
    </div>
  );
}
