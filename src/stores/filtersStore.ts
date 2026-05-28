// ============================================================
// Filters Store — filtres actifs dans le journal de trading
// ============================================================
// Ce store gère l'état temporaire des filtres de l'interface :
//   - plage de dates
//   - symbole sélectionné
//   - stratégie sélectionnée
//   - direction (long / short)
//
// Ces filtres sont utilisés pour interroger SQLite dynamiquement.
// Ils ne contiennent PAS les données elles-mêmes — SQLite reste
// la source de vérité. Les filtres dictent uniquement COMMENT
// interroger la base de données.
//
// Usage typique :
//   const { symbol, setSymbol, resetFilters } = useFiltersStore();
//   // puis passer symbol à une query SQLite dans un hook ou service
// ============================================================

import { create } from "zustand";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type TradeDirection = "long" | "short";

export interface DateRange {
  from: string | null; // format ISO 8601 : "YYYY-MM-DD"
  to: string | null;
}

// ------------------------------------------------------------
// State interface
// ------------------------------------------------------------

interface FiltersState {
  // ---- Plage de dates --------------------------------------
  /** Filtre de date appliqué au journal. null = pas de filtre. */
  dateRange: DateRange;
  setDateRange: (from: string | null, to: string | null) => void;
  clearDateRange: () => void;

  // ---- Symbole ---------------------------------------------
  /** Instrument filtré (ex : "EURUSD", "BTCUSD"). null = tous. */
  symbol: string | null;
  setSymbol: (symbol: string | null) => void;

  // ---- Stratégie -------------------------------------------
  /** ID de la stratégie filtrée (FK vers la table strategies). null = toutes. */
  strategyId: number | null;
  setStrategyId: (id: number | null) => void;

  // ---- Direction -------------------------------------------
  /** Direction filtrée. null = long et short. */
  direction: TradeDirection | null;
  setDirection: (direction: TradeDirection | null) => void;

  // ---- Réinitialisation ------------------------------------
  /** Remet tous les filtres à leur valeur initiale. */
  resetFilters: () => void;
}

// ------------------------------------------------------------
// État initial (extrait pour pouvoir le réutiliser dans reset)
// ------------------------------------------------------------

const INITIAL_FILTERS = {
  dateRange: { from: null, to: null },
  symbol: null,
  strategyId: null,
  direction: null,
} satisfies Pick<FiltersState, "dateRange" | "symbol" | "strategyId" | "direction">;

// ------------------------------------------------------------
// Store
// ------------------------------------------------------------

export const useFiltersStore = create<FiltersState>()((set) => ({
  ...INITIAL_FILTERS,

  // ---- Plage de dates --------------------------------------
  setDateRange: (from, to) => set({ dateRange: { from, to } }),
  clearDateRange: () => set({ dateRange: { from: null, to: null } }),

  // ---- Symbole ---------------------------------------------
  setSymbol: (symbol) => set({ symbol }),

  // ---- Stratégie -------------------------------------------
  setStrategyId: (strategyId) => set({ strategyId }),

  // ---- Direction -------------------------------------------
  setDirection: (direction) => set({ direction }),

  // ---- Réinitialisation ------------------------------------
  resetFilters: () => set(INITIAL_FILTERS),
}));
