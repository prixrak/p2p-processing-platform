'use client';

import { ExternalLink } from 'lucide-react';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { internalPaths } from '@/lib/internal-api';

/**
 * Square-ish thumbnail tile that opens a full-size preview when clicked.
 * Designed to live inside `ProofThumbnailGrid`.
 */
export function FilePreviewTile({
  fileId,
  alt,
  onOpen,
  maxHeightClass = 'max-h-28',
  aspectClass = 'aspect-video',
}: {
  fileId: string;
  alt: string;
  onOpen: (fileId: string) => void;
  /** Tailwind utility for max image height (defaults to compact `max-h-28`). */
  maxHeightClass?: string;
  /** Tailwind aspect ratio container utility (defaults to `aspect-video`). */
  aspectClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(fileId)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-left transition-colors hover:border-accent-blue"
    >
      <div className={`pointer-events-none ${aspectClass} ${maxHeightClass}`}>
        <AuthorizedFilePreview
          path={internalPaths.fileById(fileId)}
          alt={alt}
          className={`h-full ${maxHeightClass}`}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35">
        <ExternalLink className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
}

/**
 * Renders a responsive grid of clickable proof thumbnails.
 * Used for: appeal proof files, FORK chat screenshots, payout completion proofs.
 */
export function ProofThumbnailGrid({
  fileIds,
  alt,
  onOpen,
  columnsClass = 'grid-cols-2 sm:grid-cols-3',
  tileMaxHeightClass,
  tileAspectClass,
}: {
  fileIds: readonly string[];
  alt: string;
  onOpen: (fileId: string) => void;
  /** Tailwind grid template utility (defaults to 2 cols mobile, 3 cols desktop). */
  columnsClass?: string;
  tileMaxHeightClass?: string;
  tileAspectClass?: string;
}) {
  if (fileIds.length === 0) return null;
  return (
    <div className={`grid gap-2 ${columnsClass}`}>
      {fileIds.map((fileId) => (
        <FilePreviewTile
          key={fileId}
          fileId={fileId}
          alt={alt}
          onOpen={onOpen}
          maxHeightClass={tileMaxHeightClass}
          aspectClass={tileAspectClass}
        />
      ))}
    </div>
  );
}
