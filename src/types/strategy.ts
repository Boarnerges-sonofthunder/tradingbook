// ============================================================
// Types — Strategy
// ============================================================
// Une stratégie est un ensemble de règles appliquées à un trade.
// Les trades peuvent être associés à une stratégie (FK optionnelle).
// ============================================================

export interface Strategy {
  id: number;
  name: string;
  description: string | null;
  /** Règles de trading (texte libre ou liste formatée). */
  rules: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Données du formulaire de création/modification d'une stratégie. */
export interface StrategyFormData {
  name: string;
  description?: string | null;
  rules?: string | null;
  isActive?: boolean;
}
