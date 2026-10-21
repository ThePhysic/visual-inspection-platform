import { QueryClient, queryOptions } from '@tanstack/react-query';
import { ApiClientError, fetchInspection } from './api';

export const INSPECTION_POLL_MS = 2000;
export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

export function inspectionQuery(id: string) {
  return queryOptions({
    queryKey: ['inspection', id.toLowerCase()],
    queryFn: ({ signal }) => fetchInspection(id, signal),
    enabled: /^[a-f0-9]{24}$/i.test(id),
    refetchInterval: query => {
      const { data, error } = query.state;
      if (data?.status === 'completed' || data?.status === 'failed') return false;
      if (error instanceof ApiClientError && !error.retryable) return false;
      return INSPECTION_POLL_MS;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: query => !['completed', 'failed'].includes(query.state.data?.status ?? ''),
  });
}
