import { memo, useMemo } from "react";
import { X } from "lucide-react";
import type { TradesFilterOptions, TradesMultiFilters } from "../../../types";
import { hasActiveTradesFilters } from "../../../services/filters";

interface TradesResultsSummaryProps {
  filters: TradesMultiFilters;
  options: TradesFilterOptions;
  total: number;
  loading?: boolean;
  onReset: () => void;
}

function findName(
  items: { id: number; name: string }[],
  id: number | "all",
): string | null {
  if (id === "all") return null;
  return items.find((item) => item.id === id)?.name ?? null;
}

export const TradesResultsSummary = memo(function TradesResultsSummary({
  filters,
  options,
  total,
  loading = false,
  onReset,
}: TradesResultsSummaryProps) {
  const chips = useMemo(() => {
    const nextChips: string[] = [];

    if (filters.dateFrom) nextChips.push(`Du ${filters.dateFrom}`);
    if (filters.dateTo) nextChips.push(`Au ${filters.dateTo}`);
    if (filters.symbol) nextChips.push(`Symbole: ${filters.symbol}`);
    if (filters.status !== "all") nextChips.push(`Statut: ${filters.status}`);
    if (filters.side !== "all") nextChips.push(`Direction: ${filters.side}`);
    if (filters.broker) nextChips.push(`Broker: ${filters.broker}`);
    if (typeof filters.brokerId === "number") {
      nextChips.push(
        `Broker normalisé: ${findName(options.brokersCatalog, filters.brokerId) ?? filters.brokerId}`,
      );
    }
    if (filters.platform !== "all")
      nextChips.push(`Plateforme: ${filters.platform.toUpperCase()}`);
    if (filters.accountId) nextChips.push(`Compte: ${filters.accountId}`);
    if (typeof filters.tradingAccountId === "number") {
      nextChips.push(
        `Compte normalisé : ${findName(options.tradingAccounts, filters.tradingAccountId) ?? filters.tradingAccountId}`,
      );
    }
    if (filters.strategyId === "none")
      nextChips.push("Stratégie : Sans stratégie");
    if (typeof filters.strategyId === "number") {
      const strategyName = findName(options.strategies, filters.strategyId);
      nextChips.push(`Stratégie : ${strategyName ?? filters.strategyId}`);
    }
    if (filters.tagId !== "all") {
      nextChips.push(
        `Tag: ${findName(options.tags, filters.tagId) ?? filters.tagId}`,
      );
    }
    if (filters.emotionId !== "all") {
      nextChips.push(
        `Émotion : ${findName(options.emotions, filters.emotionId) ?? filters.emotionId}`,
      );
    }
    if (filters.mistakeId !== "all") {
      nextChips.push(
        `Erreur: ${findName(options.mistakes, filters.mistakeId) ?? filters.mistakeId}`,
      );
    }
    if (filters.result !== "all")
      nextChips.push(`Résultat : ${filters.result}`);
    if (filters.source !== "all") nextChips.push(`Source: ${filters.source}`);

    return nextChips;
  }, [filters, options]);

  const hasFilters = useMemo(() => hasActiveTradesFilters(filters), [filters]);

  return (
    <div className="trades-results-summary" aria-live="polite">
      <div className="trades-results-summary__count">
        <strong>{loading ? "…" : total}</strong>
        <span>
          trade{total !== 1 ? "s" : ""} affiché{total !== 1 ? "s" : ""}
        </span>
      </div>

      {hasFilters && (
        <div
          className="trades-results-summary__chips"
          aria-label="Filtres actifs"
        >
          {chips.map((chip) => (
            <span key={chip} className="trades-results-summary__chip">
              {chip}
            </span>
          ))}
          <button
            type="button"
            className="trades-results-summary__clear"
            onClick={onReset}
            aria-label="Réinitialiser tous les filtres"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
});
