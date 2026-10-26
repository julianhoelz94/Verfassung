'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from './TranslationProvider';
import type { UiMessage } from '../../lib/messages';

type MenuDisclosureProps = {
  label: string | UiMessage;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MenuDisclosure({ label, trigger, children, className }: MenuDisclosureProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function close(): void {
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    function onPointer(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div className={['menu', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={typeof label === 'string' ? label : t(label)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="menu-panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}
