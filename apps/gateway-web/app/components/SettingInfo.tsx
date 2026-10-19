'use client';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type SettingChangeability = 'once' | 'later' | 'review';

const changeabilityText = {
  once: ui.help.setOnce,
  later: ui.help.canChangeLater,
  review: ui.help.canChangeAfterReview,
} satisfies Record<SettingChangeability, { en: string; de: string }>;

export function SettingInfo({ label, description, changeability, changeNote }: {
  label: ReactNode;
  description: ReactNode;
  changeability: SettingChangeability;
  changeNote?: ReactNode;
}) {
  const t = useTranslation();
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
      <span id={`${id}-context`} className="visually-hidden"><T value={ui.components.settinginfo.about} />{" "}{label}</span>
      <button
        type="button"
        className="setting-info-trigger"
        aria-label={t(ui.help.settingInformation)}
        aria-describedby={`${id}-context`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      ><T value={ui.components.settinginfo.i} /></button>
      {open ? (
        <span className="setting-info-box" id={id} role="note" ref={box} style={{ left: boxOffset }}>
          <strong>{label}</strong>
          <span>{description}</span>
          <span className="setting-info-changeability">{changeNote ?? t(changeabilityText[changeability])}</span>
        </span>
      ) : null}
    </span>
  );
}
