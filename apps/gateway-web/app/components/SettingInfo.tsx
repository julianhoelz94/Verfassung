'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type SettingChangeability = 'once' | 'later' | 'review';

const changeabilityText: Record<SettingChangeability, string> = {
  once: 'Set once when the constitution is created.',
  later: 'Can be changed later.',
  review: 'Can be changed later after an impact check. Existing content may require a reviewed successor.',
};

export function SettingInfo({ label, description, changeability, changeNote }: {
  label: string;
  description: string;
  changeability: SettingChangeability;
  changeNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [boxOffset, setBoxOffset] = useState(0);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const positionBox = () => {
      if (!root.current || !box.current) return;
      const buttonLeft = root.current.getBoundingClientRect().left;
      const width = box.current.getBoundingClientRect().width;
      const left = Math.max(16, Math.min(buttonLeft, window.innerWidth - width - 16));
      setBoxOffset(left - buttonLeft);
    };
    positionBox();
    window.addEventListener('resize', positionBox);
    return () => window.removeEventListener('resize', positionBox);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <span className="setting-info" ref={root}>
      <span id={`${id}-context`} className="visually-hidden">About {label}</span>
      <button
        type="button"
        className="setting-info-trigger"
        aria-label="Setting information"
        aria-describedby={`${id}-context`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >i</button>
      {open ? (
        <span className="setting-info-box" id={id} role="note" ref={box} style={{ left: boxOffset }}>
          <strong>{label}</strong>
          <span>{description}</span>
          <span className="setting-info-changeability">{changeNote ?? changeabilityText[changeability]}</span>
        </span>
      ) : null}
    </span>
  );
}
