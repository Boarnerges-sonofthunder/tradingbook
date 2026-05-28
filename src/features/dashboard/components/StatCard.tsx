// ============================================================
// Composant — StatCard
// ============================================================
// Carte de statistique réutilisable pour le dashboard.
//
// Variantes visuelles :
//   default  — blanc/gris neutre (valeur sans connotation)
//   positive — vert (profit, gain, bon résultat)
//   negative — rouge (perte, mauvais résultat)
//   warning  — orange/jaune (alerte, vigilance)
//   neutral  — gris secondaire (information neutre)
// ============================================================

import { memo } from "react";

interface StatCardProps {
  /** Libellé affiché en haut de la carte (ex. "Win Rate"). */
  label: string;
  /** Valeur principale affichée en grand (ex. "65.4%"). */
  value: string;
  /** Texte secondaire affiché sous la valeur (ex. "sur 48 trades"). */
  subtext?: string;
  /**
   * Variante de couleur de la valeur.
   * Défaut : "default" (couleur texte primaire).
   */
  variant?: "default" | "positive" | "negative" | "warning" | "neutral";
}

const StatCard = memo(function StatCard({
  label,
  value,
  subtext,
  variant = "default",
}: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className={`stat-card__value stat-card__value--${variant}`}>
        {value}
      </span>
      {subtext !== undefined && subtext !== "" && (
        <span className="stat-card__subtext">{subtext}</span>
      )}
    </div>
  );
});

export default StatCard;
