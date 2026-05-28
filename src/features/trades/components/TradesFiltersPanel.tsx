import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { hasActiveTradesFilters } from "../../../services/filters";
import type { TradesFilterOptions, TradesMultiFilters } from "../../../types";

interface TradesFiltersPanelProps {
  filters: TradesMultiFilters;
  options: TradesFilterOptions;
  loading?: boolean;
  onChange: (filters: TradesMultiFilters) => void;
  onReset: () => void;
}

function toNumberOrAll(value: string): number | "all" {
  return value === "all" ? "all" : Number(value);
}

function findName(
  items: { id: number; name: string }[],
  id: number | "all",
): string | null {
  if (id === "all") return null;
  return items.find((item) => item.id === id)?.name ?? null;
}

export const TradesFiltersPanel = memo(function TradesFiltersPanel({
  filters,
  options,
  loading = false,
  onChange,
  onReset,
}: TradesFiltersPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const updateFilter = <Key extends keyof TradesMultiFilters>(
    key: Key,
    value: TradesMultiFilters[Key],
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const activeChips = useMemo(() => {
    const chips: string[] = [];

    if (filters.dateFrom) chips.push(`Du ${filters.dateFrom}`);
    if (filters.dateTo) chips.push(`Au ${filters.dateTo}`);
    if (filters.symbol) chips.push(`Symbole: ${filters.symbol}`);
    if (filters.status !== "all") chips.push(`Statut: ${filters.status}`);
    if (filters.side !== "all") chips.push(`Direction: ${filters.side}`);
    if (filters.broker) chips.push(`Broker: ${filters.broker}`);
    if (typeof filters.brokerId === "number") {
      chips.push(
        `Broker normalisé: ${findName(options.brokersCatalog, filters.brokerId) ?? filters.brokerId}`,
      );
    }
    if (filters.platform !== "all")
      chips.push(`Plateforme: ${filters.platform.toUpperCase()}`);
    if (filters.accountId) chips.push(`Compte: ${filters.accountId}`);
    if (typeof filters.tradingAccountId === "number") {
      chips.push(
        `Compte normalisé : ${findName(options.tradingAccounts, filters.tradingAccountId) ?? filters.tradingAccountId}`,
      );
    }
    if (filters.strategyId === "none") chips.push("Stratégie : Sans stratégie");
    if (typeof filters.strategyId === "number") {
      chips.push(
        `Stratégie : ${findName(options.strategies, filters.strategyId) ?? filters.strategyId}`,
      );
    }
    if (filters.tagId !== "all") {
      chips.push(
        `Tag: ${findName(options.tags, filters.tagId) ?? filters.tagId}`,
      );
    }
    if (filters.emotionId !== "all") {
      chips.push(
        `Émotion : ${findName(options.emotions, filters.emotionId) ?? filters.emotionId}`,
      );
    }
    if (filters.mistakeId !== "all") {
      chips.push(
        `Erreur: ${findName(options.mistakes, filters.mistakeId) ?? filters.mistakeId}`,
      );
    }
    if (filters.result !== "all") chips.push(`Résultat : ${filters.result}`);
    if (filters.source !== "all") chips.push(`Source: ${filters.source}`);

    return chips;
  }, [filters, options]);

  const hasFilters = hasActiveTradesFilters(filters);
  const previewChips = activeChips.slice(0, 3);
  const hiddenChipCount = Math.max(0, activeChips.length - previewChips.length);

  const handleReset = () => {
    onReset();
    setExpanded(false);
  };

  return (
    <section
      className={`trades-filters-panel trades-filters-panel--compact${expanded ? " is-expanded" : ""}`}
      aria-label="Filtres des trades"
    >
      <div className="trades-filters-panel__header">
        <div className="trades-filters-panel__title-group">
          <div className="trades-filters-panel__title">
            <SlidersHorizontal size={16} aria-hidden />
            <span>Filtres</span>
          </div>
          <div className="trades-filters-panel__meta">
            {hasFilters ? (
              <>
                <span>
                  {activeChips.length} filtre{activeChips.length > 1 ? "s" : ""}{" "}
                  actif{activeChips.length > 1 ? "s" : ""}
                </span>
                {previewChips.length > 0 && (
                  <div
                    className="trades-filters-panel__chips"
                    aria-label="Aperçu des filtres actifs"
                  >
                    {previewChips.map((chip) => (
                      <span key={chip} className="trades-filters-panel__chip">
                        {chip}
                      </span>
                    ))}
                    {hiddenChipCount > 0 && (
                      <span className="trades-filters-panel__chip trades-filters-panel__chip--more">
                        +{hiddenChipCount}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span>Aucun filtre actif</span>
            )}
          </div>
        </div>

        <div className="trades-filters-panel__actions">
          <button
            type="button"
            className="btn-ghost btn-icon-text"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Masquer" : "Afficher"}
          </button>
          <button
            type="button"
            className="btn-secondary btn-icon-text"
            onClick={handleReset}
            disabled={loading}
          >
            <RotateCcw size={14} aria-hidden />
            Réinitialiser
          </button>
        </div>
      </div>

      {expanded && (
        <div className="trades-filters-panel__grid">
          <label className="form-group">
            <span className="form-label">Date</span>
            <select
              value={filters.dateField}
              onChange={(event) =>
                updateFilter(
                  "dateField",
                  event.target.value as TradesMultiFilters["dateField"],
                )
              }
            >
              <option value="openedAt">Ouverture</option>
              <option value="closedAt">Clôture</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Du</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
            />
          </label>

          <label className="form-group">
            <span className="form-label">Au</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
            />
          </label>

          <label className="form-group">
            <span className="form-label">Symbole</span>
            <input
              list="trades-filter-symbols"
              placeholder="XAUUSD"
              value={filters.symbol}
              onChange={(event) => updateFilter("symbol", event.target.value)}
            />
            <datalist id="trades-filter-symbols">
              {options.symbols.map((symbol) => (
                <option key={symbol} value={symbol} />
              ))}
            </datalist>
          </label>

          <label className="form-group">
            <span className="form-label">Statut</span>
            <select
              value={filters.status}
              onChange={(event) =>
                updateFilter(
                  "status",
                  event.target.value as TradesMultiFilters["status"],
                )
              }
            >
              <option value="all">Tous</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Annulé</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Direction</span>
            <select
              value={filters.side}
              onChange={(event) =>
                updateFilter(
                  "side",
                  event.target.value as TradesMultiFilters["side"],
                )
              }
            >
              <option value="all">Toutes</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Broker</span>
            <input
              list="trades-filter-brokers"
              placeholder="Broker"
              value={filters.broker}
              onChange={(event) => updateFilter("broker", event.target.value)}
            />
            <datalist id="trades-filter-brokers">
              {options.brokers.map((broker) => (
                <option key={broker} value={broker} />
              ))}
            </datalist>
          </label>

          <label className="form-group">
            <span className="form-label">Broker normalisé</span>
            <select
              value={String(filters.brokerId)}
              onChange={(event) =>
                updateFilter("brokerId", toNumberOrAll(event.target.value))
              }
            >
              <option value="all">Tous</option>
              {options.brokersCatalog.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Plateforme</span>
            <select
              value={filters.platform}
              onChange={(event) =>
                updateFilter(
                  "platform",
                  event.target.value as TradesMultiFilters["platform"],
                )
              }
            >
              <option value="all">Toutes</option>
              {options.platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Compte</span>
            <input
              list="trades-filter-accounts"
              placeholder="Compte"
              value={filters.accountId}
              onChange={(event) =>
                updateFilter("accountId", event.target.value)
              }
            />
            <datalist id="trades-filter-accounts">
              {options.accounts.map((account) => (
                <option key={account} value={account} />
              ))}
            </datalist>
          </label>

          <label className="form-group">
            <span className="form-label">Compte normalisé</span>
            <select
              value={String(filters.tradingAccountId)}
              onChange={(event) =>
                updateFilter(
                  "tradingAccountId",
                  toNumberOrAll(event.target.value),
                )
              }
            >
              <option value="all">Tous</option>
              {options.tradingAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Stratégie</span>
            <select
              value={String(filters.strategyId)}
              onChange={(event) => {
                const value = event.target.value;
                updateFilter(
                  "strategyId",
                  value === "none" ? "none" : toNumberOrAll(value),
                );
              }}
            >
              <option value="all">Toutes</option>
              <option value="none">Sans stratégie</option>
              {options.strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Tag</span>
            <select
              value={String(filters.tagId)}
              onChange={(event) =>
                updateFilter("tagId", toNumberOrAll(event.target.value))
              }
            >
              <option value="all">Tous</option>
              {options.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Émotion</span>
            <select
              value={String(filters.emotionId)}
              onChange={(event) =>
                updateFilter("emotionId", toNumberOrAll(event.target.value))
              }
            >
              <option value="all">Toutes</option>
              {options.emotions.map((emotion) => (
                <option key={emotion.id} value={emotion.id}>
                  {emotion.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Erreur</span>
            <select
              value={String(filters.mistakeId)}
              onChange={(event) =>
                updateFilter("mistakeId", toNumberOrAll(event.target.value))
              }
            >
              <option value="all">Toutes</option>
              {options.mistakes.map((mistake) => (
                <option key={mistake.id} value={mistake.id}>
                  {mistake.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Résultat</span>
            <select
              value={filters.result}
              onChange={(event) =>
                updateFilter(
                  "result",
                  event.target.value as TradesMultiFilters["result"],
                )
              }
            >
              <option value="all">Tous</option>
              <option value="winning">Gagnant</option>
              <option value="losing">Perdant</option>
              <option value="breakeven">Breakeven</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Source</span>
            <select
              value={filters.source}
              onChange={(event) =>
                updateFilter(
                  "source",
                  event.target.value as TradesMultiFilters["source"],
                )
              }
            >
              <option value="all">Toutes</option>
              <option value="manual">Manual</option>
              <option value="csv_import">CSV import</option>
              <option value="mt5_sync">MT5 sync</option>
              <option value="mt4_import">MT4 import</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
});
