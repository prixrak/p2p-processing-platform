'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export type AuthorizedFilePreviewProps = {
  /** API path from `internalPaths.fileById` (Bearer via `api`). */
  path: string;
  alt: string;
  className?: string;
};

function fileIdFromInternalFilesPath(path: string): string | null {
  const m = path.match(/\/api\/files\/([0-9a-f-]{36})\/?(?:\?.*)?$/i);
  return m?.[1] ?? null;
}

/**
 * Loads a secured file with JWT: resolves a storage URL via JSON (avoids fetch redirect→S3 CORS).
 * Plain `<img>` to `/api/files/...` cannot send Authorization; fetch()+302 to S3 breaks CORS.
 */
export function AuthorizedFilePreview({ path, alt, className }: AuthorizedFilePreviewProps) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setPhase('loading');
        const fileId = fileIdFromInternalFilesPath(path);
        if (!fileId) {
          if (!cancelled) setPhase('error');
          return;
        }
        const signed = await api.getFileSignedUrl(fileId);
        if (cancelled) return;
        setMime(signed.mimeType);
        setObjectUrl(signed.url);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (phase === 'loading') {
    return (
      <div
        className={cn(
          'flex aspect-video w-full animate-pulse items-center justify-center rounded-lg border border-border-primary bg-bg-secondary',
          className,
        )}
      >
        <span className="text-xs text-text-muted">Loading…</span>
      </div>
    );
  }

  if (phase === 'error' || !objectUrl) {
    return (
      <div
        className={cn(
          'flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-border-primary bg-bg-secondary p-4',
          className,
        )}
      >
        <FileText className="h-10 w-10 text-text-muted" />
        <span className="text-center text-xs text-text-muted">
          Unable to load file. Check permission or refresh the page.
        </span>
      </div>
    );
  }

  if (mime?.includes('pdf')) {
    return (
      <iframe
        title={alt}
        src={objectUrl}
        className={cn('h-[min(70vh,640px)] w-full rounded-lg border border-border-primary', className)}
      />
    );
  }

  return (
    <img src={objectUrl} alt={alt} className={cn('h-full w-full object-contain', className)} />
  );
}
