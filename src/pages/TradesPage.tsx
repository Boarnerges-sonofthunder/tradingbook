import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { ROUTES } from "../constants/routes";
import { TradesFiltersPanel } from "../features/trades/components/TradesFiltersPanel";
import { TradesPagination } from "../features/trades/components/TradesPagination";
import { TradesResultsSummary } from "../features/trades/components/TradesResultsSummary";
import { TradesTable } from "../features/trades/components/TradesTable";
import {
  DEFAULT_TRADES_FILTERS,
  getFilteredTradesPageData,
  getTradesFilterOptionsData,
} from "../services/filters";
import {
  DEFAULT_TRADES_PAGINATION,
  buildPaginationMeta,
} from "../services/pagination";
import { saveSettings } from "../services/settings/settingsService";
import { DEFAULT_TRADES_SORT } from "../services/sorting";
import { useUserSettings } from "../hooks";
import { tr } from "../utils/i18n";
import type {
  PageSize,
  PaginationMeta,
  PaginationState,
  Trade,
  TradesFilterOptions,
  TradesMultiFilters,
  TradesSort,
} from "../types";

const EMPTY_FILTER_OPTIONS: TradesFilterOptions = {
  symbols: [],
  brokers: [],
  brokersCatalog: [],
  accounts: [],
  tradingAccounts: [],
  platforms: [],
  strategies: [],
  tags: [],
  emotions: [],
  mistakes: [],
};

export default function TradesPage() {
  const navigate = useNavigate();
  const userSettings = useUserSettings();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [options, setOptions] =
    useState<TradesFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [filters, setFilters] = useState<TradesMultiFilters>(
    DEFAULT_TRADES_FILTERS,
  );
  const [sort, setSort] = useState<TradesSort>(DEFAULT_TRADES_SORT);
  const [pagination, setPagination] = useState<PaginationState>(
    DEFAULT_TRADES_PAGINATION,
  );
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta>(
    buildPaginationMeta(0, DEFAULT_TRADES_PAGINATION),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(0);
  const deferredFilters = useDeferredValue(filters);

  const loadTrades = useCallback(
    async (
      nextFilters: TradesMultiFilters,
      nextSort: TradesSort,
      nextPagination: PaginationState,
    ) => {
      const requestId = latestRequestRef.current + 1;
      latestRequestRef.current = requestId;
      setLoading(true);
      setError(null);

      try {
        const result = await getFilteredTradesPageData(
          nextFilters,
          nextSort,
          nextPagination,
        );

        if (requestId !== latestRequestRef.current) {
          return;
        }

        // Les mises à jour de liste peuvent être volumineuses ; on les laisse
        // en priorité basse pour garder les champs de filtre fluides.
        startTransition(() => {
          setTrades(result.trades);
          setPaginationMeta(result.pagination);
          if (result.pagination.page !== nextPagination.page) {
            setPagination({
              page: result.pagination.page,
              pageSize: result.pagination.pageSize,
            });
          }
        });
      } catch (err) {
        if (requestId !== latestRequestRef.current) {
          return;
        }

        setTrades([]);
        setPaginationMeta(buildPaginationMeta(0, nextPagination));
        setError(
          err instanceof Error
            ? err.message
            : tr(
                userSettings.language,
                "Impossible de charger les trades filtrés.",
                "Unable to load filtered trades.",
              ),
        );
      } finally {
        if (requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [userSettings.language],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const nextOptions = await getTradesFilterOptionsData();
        if (!cancelled) {
          setOptions(nextOptions);
        }
      } catch {
        if (!cancelled) {
          setOptions(EMPTY_FILTER_OPTIONS);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadTrades(deferredFilters, sort, pagination);
  }, [deferredFilters, sort, pagination, loadTrades]);

  useEffect(() => {
    setPagination((current) =>
      current.pageSize === userSettings.tradesPerPage
        ? current
        : { page: 1, pageSize: userSettings.tradesPerPage },
    );
  }, [userSettings.tradesPerPage]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_TRADES_FILTERS);
    setSort(DEFAULT_TRADES_SORT);
    setPagination({ page: 1, pageSize: userSettings.tradesPerPage });
  }, [userSettings.tradesPerPage]);

  const updateFilters = useCallback((nextFilters: TradesMultiFilters) => {
    setFilters(nextFilters);
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const updateSort = useCallback((nextSort: TradesSort) => {
    setSort(nextSort);
    setPagination((current) => ({ ...current, page: 1 }));
  }, []);

  const updatePageSize = useCallback((pageSize: PageSize) => {
    setPagination({ page: 1, pageSize });
    void saveSettings({ tradesPerPage: pageSize });
  }, []);

  const updatePage = useCallback((page: number) => {
    setPagination((current) => ({ ...current, page }));
  }, []);

  const openNewTrade = useCallback(() => {
    navigate(ROUTES.TRADE_NEW);
  }, [navigate]);

  return (
    <div className="content-max">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Journal des trades</h1>
          <p className="page-subtitle">
            {tr(
              userSettings.language,
              "Filtrez vos trades par période, symbole, compte, stratégie et journal.",
              "Filter your trades by period, symbol, account, strategy and journal.",
            )}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn-primary btn-icon-text"
            onClick={openNewTrade}
            aria-label={tr(
              userSettings.language,
              "Créer un nouveau trade",
              "Create a new trade",
            )}
          >
            <Plus size={14} aria-hidden />
            {tr(userSettings.language, "Nouveau trade", "New trade")}
          </button>
        </div>
      </div>

      <TradesFiltersPanel
        filters={filters}
        options={options}
        loading={loading}
        onChange={updateFilters}
        onReset={resetFilters}
      />

      <TradesResultsSummary
        filters={filters}
        options={options}
        total={paginationMeta.total}
        loading={loading}
        onReset={resetFilters}
      />

      <TradesPagination
        pagination={paginationMeta}
        loading={loading}
        onPageChange={updatePage}
        onPageSizeChange={updatePageSize}
      />

      {error && <div className="form-errors-banner">{error}</div>}

      {loading ? (
        <p className="page-loading">
          {tr(
            userSettings.language,
            "Chargement des trades…",
            "Loading trades...",
          )}
        </p>
      ) : trades.length === 0 ? (
        <div className="trades-empty">
          <p className="trades-empty__title">
            {tr(userSettings.language, "Aucun trade trouvé", "No trades found")}
          </p>
          <p className="trades-empty__hint">
            {tr(
              userSettings.language,
              "Ajustez les filtres ou réinitialisez-les pour afficher tous les trades.",
              "Adjust filters or reset them to display all trades.",
            )}
          </p>
          <button
            className="btn-secondary btn-icon-text"
            onClick={resetFilters}
          >
            {tr(userSettings.language, "Réinitialiser", "Reset")}
          </button>
        </div>
      ) : (
        <TradesTable
          trades={trades}
          sort={sort}
          settings={userSettings}
          onSortChange={updateSort}
        />
      )}

      {!loading && paginationMeta.total > 0 && (
        <TradesPagination
          pagination={paginationMeta}
          loading={loading}
          onPageChange={updatePage}
          onPageSizeChange={updatePageSize}
        />
      )}
    </div>
  );
}
