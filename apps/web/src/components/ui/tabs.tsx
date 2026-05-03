'use client';

import { clsx } from 'clsx';

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={clsx('flex gap-1 p-1 bg-bg-secondary rounded-lg w-fit', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            active === tab.key
              ? 'bg-bg-card text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.45)]'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
