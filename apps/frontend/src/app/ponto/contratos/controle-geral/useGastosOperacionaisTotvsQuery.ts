'use client';

import { useLayoutEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchGastosOperacionaisTotvs,
  GASTOS_OPERACIONAIS_TOTVS_GC_TIME,
  GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
  GASTOS_OPERACIONAIS_TOTVS_STALE_TIME
} from './fetchGastosOperacionaisTotvs';
import {
  readGastosOperacionaisTotvsPersisted,
  readGastosOperacionaisTotvsPersistedSync
} from './gastosOperacionaisTotvsPersist';

function seedQueryFromPersisted(
  queryClient: ReturnType<typeof useQueryClient>,
  persisted: { data: unknown; updatedAt: number }
) {
  queryClient.setQueryData(GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY, persisted.data);
  const cached = queryClient.getQueryCache().find({
    queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY
  });
  if (cached) {
    cached.setState({ dataUpdatedAt: persisted.updatedAt });
  }
}

/**
 * Cache em memória + IndexedDB/localStorage.
 * Hidrata no client após mount (evita bug de SSR do Next que zera o initialData).
 */
export function useGastosOperacionaisTotvsQuery(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const [diskReady, setDiskReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;

    // Tenta espelho síncrono primeiro (quando couber no localStorage)
    const sync = readGastosOperacionaisTotvsPersistedSync();
    if (sync) {
      seedQueryFromPersisted(queryClient, sync);
    }

    void (async () => {
      const persisted = await readGastosOperacionaisTotvsPersisted();
      if (cancelled) return;
      if (persisted) {
        seedQueryFromPersisted(queryClient, persisted);
      }
      setDiskReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: GASTOS_OPERACIONAIS_TOTVS_QUERY_KEY,
    queryFn: fetchGastosOperacionaisTotvs,
    enabled: (options?.enabled ?? true) && diskReady,
    staleTime: GASTOS_OPERACIONAIS_TOTVS_STALE_TIME,
    gcTime: GASTOS_OPERACIONAIS_TOTVS_GC_TIME,
    retry: 1
  });

  const waitingDisk = !diskReady && !query.data;

  return {
    ...query,
    /** Só bloqueia a UI se ainda não há nenhum dado (nem disco, nem rede). */
    isLoading: waitingDisk || (query.isLoading && !query.data)
  };
}
