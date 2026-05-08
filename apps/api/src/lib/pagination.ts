import { z } from 'zod';

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
});

export type PaginationParams = z.infer<typeof PaginationQuery>;

export function toSkipTake(p: PaginationParams): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

// Parse Sort: "field" → asc, "-field" → desc. Whitelisted by caller.
export function parseSort(
  sort: string | undefined,
  allowed: ReadonlyArray<string>,
  fallback: { field: string; dir: 'asc' | 'desc' },
): { field: string; dir: 'asc' | 'desc' } {
  if (!sort) return fallback;
  const dir: 'asc' | 'desc' = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '');
  if (!allowed.includes(field)) return fallback;
  return { field, dir };
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function buildPage<T>(p: PaginationParams, data: T[], total: number): Page<T> {
  return { data, page: p.page, pageSize: p.pageSize, total };
}
