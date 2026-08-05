'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { DocumentTitle } from '@/components/DocumentTitle';

function queryRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 429 || status === 401 || status === 403) return false;
  return failureCount < 1;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutos (cache padrão)
            gcTime: 10 * 60 * 1000, // 10 minutos (tempo de garbage collection)
            retry: queryRetry,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <PageTitleProvider>
        <QueryClientProvider client={queryClient}>
          <DocumentTitle />
          {children}
        </QueryClientProvider>
      </PageTitleProvider>
    </ThemeProvider>
  );
}
