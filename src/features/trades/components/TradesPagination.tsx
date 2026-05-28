import { memo, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "../../../services/pagination";
import type { PageSize, PaginationMeta } from "../../../types";

interface TradesPaginationProps {
  pagination: PaginationMeta;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}

export const TradesPagination = memo(function TradesPagination({
  pagination,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: TradesPaginationProps) {
  const firstItem = pagination.total === 0 ? 0 : pagination.offset + 1;
  const lastItem = Math.min(pagination.offset + pagination.pageSize, pagination.total);
  const pageSizeOptions = useMemo(
    () =>
      PAGE_SIZE_OPTIONS.includes(pagination.pageSize)
        ? PAGE_SIZE_OPTIONS
        : [...PAGE_SIZE_OPTIONS, pagination.pageSize].sort((a, b) => a - b),
    [pagination.pageSize],
  );

  return (
    <nav className="trades-pagination" aria-label="Pagination des trades">
      <div className="trades-pagination__summary">
        <strong>{pagination.total}</strong>
        <span>résultat{pagination.total !== 1 ? "s" : ""}</span>
        <span>
          {firstItem}-{lastItem}
        </span>
      </div>

      <label className="trades-pagination__size">
        <span>Par page</span>
        <select
          value={pagination.pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
          disabled={loading}
        >
          {pageSizeOptions.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize}
            </option>
          ))}
        </select>
      </label>

      <div className="trades-pagination__controls">
        <button
          type="button"
          className="btn-secondary btn-icon-text"
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={loading || !pagination.hasPreviousPage}
        >
          <ChevronLeft size={14} aria-hidden />
          Précédent
        </button>

        <span className="trades-pagination__page">
          Page {pagination.page} / {pagination.totalPages}
        </span>

        <button
          type="button"
          className="btn-secondary btn-icon-text"
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={loading || !pagination.hasNextPage}
        >
          Suivant
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    </nav>
  );
});
