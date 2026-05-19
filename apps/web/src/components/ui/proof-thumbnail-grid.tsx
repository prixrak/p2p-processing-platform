'use client';

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuthorizedFilePreview } from '@/components/files/authorized-file-preview';
import { internalPaths } from '@/lib/internal-api';

const DEFAULT_INLINE_MAX_VISIBLE = 3;

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
      onClick={(e) => {
        e.stopPropagation();
        onOpen(fileId);
      }}
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

/** Compact square thumbnail for dense table rows and toolbars. */
export function CompactFilePreviewTile({
  fileId,
  alt,
  onOpen,
  sizeClass = 'h-10 w-10',
  ariaLabel,
}: {
  fileId: string;
  alt: string;
  onOpen: (fileId: string) => void;
  sizeClass?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? alt}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(fileId);
      }}
      className={cn(
        'group relative shrink-0 cursor-pointer overflow-hidden rounded-md border border-border-primary bg-bg-secondary transition-colors hover:border-accent-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-blue',
        sizeClass,
      )}
    >
      <div className="pointer-events-none h-full w-full">
        <AuthorizedFilePreview
          path={internalPaths.fileById(fileId)}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
        <ExternalLink className="h-3 w-3 text-white opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
}

/**
 * Horizontal strip of compact proof thumbnails for table cells.
 * Shows up to `maxVisible` previews; overflow opens `onViewAll` when provided.
 */
export function ProofInlineThumbnails({
  fileIds,
  alt,
  onOpen,
  onViewAll,
  emptyLabel,
  maxVisible = DEFAULT_INLINE_MAX_VISIBLE,
  moreLabel,
  viewAllAriaLabel,
}: {
  fileIds: readonly string[];
  alt: string;
  onOpen: (fileId: string) => void;
  /** When set, the "+N" control calls this instead of opening a single file. */
  onViewAll?: () => void;
  emptyLabel?: string;
  maxVisible?: number;
  /** Label inside the "+N" overflow chip (e.g. "+2"). */
  moreLabel?: string;
  viewAllAriaLabel?: string;
}) {
  if (fileIds.length === 0) {
    return emptyLabel ? <span className="text-sm text-text-muted">{emptyLabel}</span> : null;
  }

  const visibleIds = fileIds.slice(0, maxVisible);
  const overflowCount = fileIds.length - maxVisible;

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {visibleIds.map((fileId, index) => (
        <CompactFilePreviewTile
          key={fileId}
          fileId={fileId}
          alt={alt}
          onOpen={onOpen}
          ariaLabel={
            fileIds.length > 1 ? `${alt} (${index + 1} of ${fileIds.length})` : alt
          }
        />
      ))}
      {overflowCount > 0 ? (
        <button
          type="button"
          aria-label={viewAllAriaLabel ?? moreLabel ?? `+${overflowCount}`}
          onClick={(e) => {
            e.stopPropagation();
            if (onViewAll) {
              onViewAll();
              return;
            }
            const nextId = fileIds[maxVisible];
            if (nextId) onOpen(nextId);
          }}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border-primary bg-bg-secondary px-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-blue hover:text-text-primary"
        >
          {moreLabel ?? `+${overflowCount}`}
        </button>
      ) : null}
    </div>
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
