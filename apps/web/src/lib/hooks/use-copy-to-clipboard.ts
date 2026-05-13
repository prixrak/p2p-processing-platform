'use client';

import { useCallback, useState } from 'react';

/**
 * `copy(text, [label])` writes to the system clipboard and flips `copied` to that label
 * (or `true`) for `feedbackMs` milliseconds. Errors are swallowed silently — the consumer
 * can opt into a toast by passing one in via `onError`.
 */
export function useCopyToClipboard(opts?: {
  feedbackMs?: number;
  onSuccess?: (label: string | true) => void;
  onError?: (err: unknown) => void;
}) {
  const feedbackMs = opts?.feedbackMs ?? 2000;
  const [copied, setCopied] = useState<string | true | null>(null);

  const copy = useCallback(
    async (text: string, label?: string) => {
      try {
        await navigator.clipboard.writeText(text);
        const marker: string | true = label ?? true;
        setCopied(marker);
        opts?.onSuccess?.(marker);
        setTimeout(() => setCopied(null), feedbackMs);
        return true;
      } catch (err) {
        opts?.onError?.(err);
        return false;
      }
    },
    [feedbackMs, opts],
  );

  return { copied, copy };
}
