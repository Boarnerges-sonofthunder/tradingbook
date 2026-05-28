export type PageSize = number;

export interface PaginationState {
  page: number;
  pageSize: PageSize;
}

export interface PaginationMeta extends PaginationState {
  total: number;
  totalPages: number;
  offset: number;
  limit: PageSize;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
