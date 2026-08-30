export interface IPaginationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1> | string;
  select?: string;
  lean?: boolean;
}

export interface IPaginatedResult<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number | null;
  prevPage?: number | null;
}

export interface IApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface IAuthUserContext {
  id: string;
  _id: string;
  username: string;
  role: string;
  clubId: string;
  clubs: string[];
  permissions: string[];
  active: boolean;
}
