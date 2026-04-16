'use client';

import {
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster, toast } from '@/components/ui/toast';
import { formatErrorMessage } from '@/lib/format-error';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.meta?.silentError) return;
            toast.error(formatErrorMessage(error));
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
