'use client';

import { useRef } from 'react';

export type TabItem = {
  id: string;
  label: string;
};

type TabsProps = {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  controlsId?: string;
};

export function Tabs({ tabs, value, onChange, ariaLabel, controlsId }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(id: string): void {
    const root = listRef.current;
    const button = root?.querySelector<HTMLButtonElement>(`[data-tab-id="${id}"]`);
    button?.focus();
  }

  return (
    <div
      ref={listRef}
      className="tabs"
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
          return;
        }
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === value);
        if (index < 0 || tabs.length === 0) {
          return;
        }
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        if (!next) {
          return;
        }
        onChange(next.id);
        focusTab(next.id);
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={controlsId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
