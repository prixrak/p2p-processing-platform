import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-primary px-4">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border-primary bg-surface-tertiary">
          <FileQuestion className="h-8 w-8 text-text-muted" aria-hidden />
        </div>
        <p className="text-sm font-medium text-text-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          The link may be outdated or the page has been moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-blue-hover"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
