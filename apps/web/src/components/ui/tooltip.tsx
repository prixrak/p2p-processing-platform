'use client';

import { clsx } from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type TooltipSide = 'top' | 'bottom';

export interface TooltipProps {
  /** Text or short node shown on hover */
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  /** Wider tooltip for longer hints */
  wide?: boolean;
  className?: string;
}

/**
 * Hover hint; portals content to document.body so it is not clipped by overflow in tables/cards.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  wide = false,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    if (side === 'top') {
      setPos({ left: cx, top: r.top });
    } else {
      setPos({ left: cx, top: r.bottom });
    }
  }, [side]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, content, updatePosition]);

  useEffect(() => {
    if (!visible) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, updatePosition]);

  if (content == null || content === '') {
    return <>{children}</>;
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={clsx('relative inline-flex max-w-full', className)}
        onMouseEnter={() => {
          updatePosition();
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => {
          updatePosition();
          setVisible(true);
        }}
        onBlur={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              transform:
                side === 'top'
                  ? 'translate(-50%, calc(-100% - 6px))'
                  : 'translate(-50%, 6px)',
              zIndex: 300,
            }}
            className={clsx(
              'pointer-events-none rounded-lg border border-border-secondary bg-surface-elevated px-2.5 py-1.5 text-xs leading-snug text-text-primary shadow-xl',
              wide
                ? 'max-w-md whitespace-normal text-left break-words'
                : 'max-w-[min(20rem,calc(100vw-2rem))] whitespace-nowrap',
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
