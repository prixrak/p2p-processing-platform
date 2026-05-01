'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-primary px-4 py-16">
      <div className="w-full max-w-md animate-fade-in rounded-2xl border border-danger/30 bg-danger-muted px-8 py-10 text-center shadow-lg shadow-black/20">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-danger" aria-hidden />
        <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="mt-2 text-sm text-text-secondary">
          An unexpected error occurred. Try again or refresh the page.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 w-full rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
