'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { Upload, X, File, Image } from 'lucide-react';
import { clsx } from 'clsx';

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.pdf';

export interface FileUploadProps {
  onChange?: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
  disabled?: boolean;
  error?: string;
  /** Smaller padding and icon — for dense layouts (e.g. table cells). */
  compact?: boolean;
}

interface FileWithPreview {
  file: File;
  id: string;
  preview?: string;
}

export function FileUpload({
  onChange,
  maxFiles = 10,
  className,
  disabled,
  error,
  compact = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (incoming: FileList | File[]) => {
      setValidationError(null);
      const newFiles: FileWithPreview[] = [];

      for (const file of Array.from(incoming)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setValidationError(`"${file.name}" is not a supported file type. Use PNG, JPG, or PDF.`);
          continue;
        }
        if (file.size > MAX_SIZE) {
          setValidationError(`"${file.name}" exceeds 25 MB limit.`);
          continue;
        }
        const preview = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined;

        newFiles.push({
          file,
          id: `${file.name}-${file.size}-${Date.now()}`,
          preview,
        });
      }

      setFiles((prev) => {
        const combined = [...prev, ...newFiles].slice(0, maxFiles);
        queueMicrotask(() => onChange?.(combined.map((f) => f.file)));
        return combined;
      });
    },
    [maxFiles, onChange],
  );

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const file = prev.find((f) => f.id === id);
        if (file?.preview) URL.revokeObjectURL(file.preview);
        const next = prev.filter((f) => f.id !== id);
        queueMicrotask(() => onChange?.(next.map((f) => f.file)));
        return next;
      });
    },
    [onChange],
  );

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!disabled && e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  };

  const displayError = error || validationError;

  return (
    <div className={clsx(compact ? 'space-y-2' : 'space-y-3', className)}>
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={clsx(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed',
          compact ? 'gap-1.5 px-3 py-4' : 'gap-2 p-8',
          'cursor-pointer transition-colors',
          disabled && 'pointer-events-none opacity-50',
          dragActive
            ? 'border-accent-blue bg-accent-blue/5'
            : displayError
              ? 'border-accent-red/50 bg-accent-red/5'
              : 'border-border-secondary hover:border-accent-blue/50 hover:bg-bg-hover/30',
        )}
      >
        <Upload
          className={clsx(
            compact ? 'h-6 w-6' : 'h-8 w-8',
            dragActive ? 'text-accent-blue' : 'text-text-muted',
          )}
        />
        <div className="text-center">
          <p
            className={clsx(
              'font-medium text-text-primary',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            Drop files here or{' '}
            <span className="text-accent-blue">browse</span>
          </p>
          <p
            className={clsx(
              'mt-1 text-text-muted',
              compact ? 'text-[10px] leading-tight' : 'text-xs',
            )}
          >
            PNG, JPG, PDF up to 25 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple={maxFiles > 1}
          className="hidden"
          disabled={disabled}
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
      </div>

      {displayError && (
        <p className="text-xs text-accent-red">{displayError}</p>
      )}

      {files.length > 0 && (
        <ul
          className={clsx(
            'grid gap-2',
            compact ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
          )}
        >
          {files.map((f) => (
            <li
              key={f.id}
              className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border-primary bg-bg-tertiary p-3"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(f.id);
                }}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-bg-secondary p-0.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent-red"
              >
                <X className="h-4 w-4" />
              </button>
              {f.preview ? (
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="h-16 w-16 rounded object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded bg-bg-hover">
                  {f.file.type === 'application/pdf' ? (
                    <File className="h-8 w-8 text-accent-red" />
                  ) : (
                    <Image className="h-8 w-8 text-text-muted" />
                  )}
                </div>
              )}
              <p className="max-w-full truncate text-[11px] text-text-secondary">
                {f.file.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
