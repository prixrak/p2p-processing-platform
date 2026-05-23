'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { computeDropdownBelowPosition } from '@/lib/anchored-dropdown-position';
import { cn } from '@/lib/utils';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange' | 'size'> {
  label?: string;
  /** Overrides default label typography (e.g. filter bars use text-xs). */
  labelClassName?: string;
  /** Extra classes on the outer flex wrapper (e.g. gap-1 for filters). */
  rootClassName?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  onChange?: SelectHTMLAttributes<HTMLSelectElement>['onChange'];
  /** Extra content rendered at the bottom of the dropdown panel (outside normal options). */
  renderListFooter?: (helpers: { close: () => void }) => ReactNode;
}

function emitChange(
  value: string,
  onChange?: SelectHTMLAttributes<HTMLSelectElement>['onChange'],
) {
  if (!onChange) return;
  const synthetic = {
    target: { value },
    currentTarget: { value },
  } as ChangeEvent<HTMLSelectElement>;
  onChange(synthetic);
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
  {
    className,
    label,
    labelClassName,
    rootClassName,
    error,
    options,
    placeholder,
    renderListFooter,
    id,
    value,
    onChange,
    disabled,
    required,
    name,
    form,
    defaultValue: _defaultValue,
    multiple: _multiple,
  },
  ref,
) {
  const genId = useId();
  const selectId = id ?? `select-${genId}`;
  const listboxId = `${selectId}-listbox`;
  const strValue = value === undefined || value === null ? '' : String(value);
  const selected = options.find((o) => o.value === strValue);
  const showPlaceholder = !selected && Boolean(placeholder);
  const labelText = selected?.label ?? (showPlaceholder ? placeholder : '');

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const [listboxPos, setListboxPos] = useState({ top: 0, left: 0, width: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const updateListboxPosition = useCallback(() => {
    const wrap = triggerWrapRef.current;
    if (!wrap) return;

    const triggerRect = wrap.getBoundingClientRect();
    const menu = listboxRef.current;
    const menuWidth = menu ? Math.max(menu.offsetWidth, triggerRect.width, 120) : Math.max(triggerRect.width, 120);
    const menuHeight = menu?.offsetHeight ?? 0;

    let top = triggerRect.bottom + 4;
    let left = triggerRect.left;

    if (menuHeight > 0) {
      const next = computeDropdownBelowPosition(
        triggerRect,
        menuWidth,
        menuHeight,
        window.innerWidth,
        window.innerHeight,
      );
      top = next.top;
      left = next.left;
      setIsPositioned(true);
    }

    setListboxPos({ top, left, width: menuWidth });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setIsPositioned(false);
      return;
    }

    updateListboxPosition();
    const frame = requestAnimationFrame(updateListboxPosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updateListboxPosition, options.length]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateListboxPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateListboxPosition]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listboxRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div
      ref={setRefs}
      className={cn('flex w-full min-w-0 flex-col gap-1.5', rootClassName)}
    >
      {name ? <input type="hidden" name={name} value={strValue} readOnly /> : null}
      {label && (
        <label
          htmlFor={selectId}
          className={cn('text-sm font-medium text-text-secondary', labelClassName)}
        >
          {label}
          {required ? <span className="text-accent-red"> *</span> : null}
        </label>
      )}
      <div ref={triggerWrapRef} className="relative w-full min-w-0">
        <button
          type="button"
          id={selectId}
          form={form}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={clsx(
            'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm',
            'bg-surface-primary text-text-primary shadow-none',
            'transition-[border-color,box-shadow] duration-150',
            error
              ? 'border-danger focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger'
              : 'border-border-primary hover:border-border-secondary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            className,
          )}
        >
          <span
            className={clsx(
              'min-w-0 flex-1 truncate',
              showPlaceholder && 'text-text-muted',
            )}
          >
            {labelText}
          </span>
          <ChevronDown
            className={clsx(
              'h-4 w-4 shrink-0 text-text-muted transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>

        {open &&
          !disabled &&
          typeof document !== 'undefined' &&
          createPortal(
            <ul
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              style={{
                position: 'fixed',
                top: listboxPos.top,
                left: listboxPos.left,
                width: listboxPos.width,
                zIndex: 250,
                visibility: isPositioned ? 'visible' : 'hidden',
              }}
              className={clsx(
                'max-h-60 overflow-auto rounded-lg border border-border-primary bg-surface-secondary py-1 shadow-2xl',
              )}
            >
              {options.map((opt) => {
                const isSelected = opt.value === strValue;
                return (
                  <li key={opt.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      className={clsx(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-accent-muted text-text-primary'
                          : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary',
                        opt.disabled && 'cursor-not-allowed opacity-40',
                        !opt.disabled && 'cursor-pointer',
                      )}
                      onClick={() => {
                        if (opt.disabled) return;
                        emitChange(opt.value, onChange);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0 truncate">{opt.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />}
                    </button>
                  </li>
                );
              })}
              {renderListFooter ? (
                <li
                  role="presentation"
                  className="sticky bottom-0 border-t border-border-primary bg-surface-secondary"
                >
                  {renderListFooter({ close: () => setOpen(false) })}
                </li>
              ) : null}
            </ul>,
            document.body,
          )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';
