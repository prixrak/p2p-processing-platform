import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_INPUT_DEBOUNCE_MS } from './use-debounced-value';

describe('DEFAULT_INPUT_DEBOUNCE_MS', () => {
  it('is a positive delay used by list search filters', () => {
    expect(DEFAULT_INPUT_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(DEFAULT_INPUT_DEBOUNCE_MS).toBe(350);
  });
});

describe('debounced filter timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the configured delay before committing', () => {
    let committed = 'initial';
    const delay = DEFAULT_INPUT_DEBOUNCE_MS;
    const t = setTimeout(() => {
      committed = 'updated';
    }, delay);
    expect(committed).toBe('initial');
    vi.advanceTimersByTime(delay - 1);
    expect(committed).toBe('initial');
    vi.advanceTimersByTime(1);
    expect(committed).toBe('updated');
    clearTimeout(t);
  });
});
