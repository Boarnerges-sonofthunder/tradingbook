import type { PageSize, PaginationMeta, PaginationState } from "../../types";

export const PAGE_SIZE_OPTIONS: PageSize[] = [5, 10, 25, 50, 100, 200];

export const DEFAULT_TRADES_PAGINATION: PaginationState = {
  page: 1,
  pageSize: 25,
};

function normalizePageSize(pageSize: unknown): PageSize {
  const parsed = Math.floor(Number(pageSize));
  if (!Number.isFinite(parsed)) return DEFAULT_TRADES_PAGINATION.pageSize;
  return Math.min(200, Math.max(5, parsed));
}

export function normalizePagination(
  pagination: Partial<PaginationState> = {},
): PaginationState {
  return {
    page: Math.max(1, Math.floor(Number(pagination.page) || 1)),
    pageSize: normalizePageSize(pagination.pageSize),
  };
}

export function buildPaginationMeta(
  total: number,
  pagination: Partial<PaginationState> = {},
): PaginationMeta {
  const normalized = normalizePagination(pagination);
  const totalPages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, totalPages);
  const offset = (page - 1) * normalized.pageSize;

  return {
    total,
    totalPages,
    page,
    pageSize: normalized.pageSize,
    offset,
    limit: normalized.pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}
