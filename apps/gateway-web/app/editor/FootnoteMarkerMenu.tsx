'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../components/TranslationProvider';
import styles from './FootnoteMarkerMenu.module.css';

type Anchor={ x: number; y: number; trigger?: HTMLElement };
type MenuItem={label:string;onSelect:()=>void;disabled?:boolean;destructive?:boolean};
type Props = {
  anchor: { x: number; y: number; trigger?: HTMLElement };
  label: string;
  onEdit: () => void;
  onMove: () => void;
  onRemove: () => void;
  onNavigate: () => void;
  onClose: () => void;
  onCopyLink?:()=>void;
  copyDisabled?:boolean;
};

export function EditorContextMenu({anchor,label,items,onClose}:{anchor:Anchor;label:string;items:MenuItem[];onClose:()=>void}){
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    if (anchor.trigger?.isConnected) anchor.trigger.focus({ preventScroll: true });
    onClose();
  }, [anchor.trigger, onClose]);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = Math.max(8, Math.min(anchor.x, window.innerWidth - bounds.width - 8)) + 'px';
    element.style.top = Math.max(8, Math.min(anchor.y, window.innerHeight - bounds.height - 8)) + 'px';
    element.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus({ preventScroll: true });
    function outside(event: PointerEvent) { if (event.target instanceof Node && !element!.contains(event.target)) close(); }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(element!.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'));
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keydown, true); window.removeEventListener('resize', close); };
  }, [anchor.x, anchor.y, close]);
  function choose(action: () => void) { close(); action(); }
  return typeof document === 'undefined' ? null : createPortal(<div ref={menu} className={styles.menu} role="menu" aria-label={label} style={{ left: anchor.x, top: anchor.y }}>
    {items.map(item=><button key={item.label} type="button" role="menuitem" disabled={item.disabled} data-destructive={item.destructive||undefined} onClick={()=>choose(item.onSelect)}>{item.label}</button>)}
  </div>, document.body);
}

export function FootnoteMarkerMenu({anchor,label,onEdit,onMove,onRemove,onNavigate,onClose,onCopyLink,copyDisabled}:Props){
  const t=useTranslation(),copy=(en:string,de:string)=>t({en,de});
  return <EditorContextMenu anchor={anchor} label={copy('Footnote','Fußnote')+' '+label} onClose={onClose} items={[{label:copy('Edit footnote','Fußnote bearbeiten'),onSelect:onEdit},{label:copy('Move marker…','Verweiszeichen verschieben…'),onSelect:onMove},{label:copy('Remove marker','Verweiszeichen entfernen'),onSelect:onRemove,destructive:true},{label:copy('Go to footnote','Zur Fußnote'),onSelect:onNavigate},...(onCopyLink?[{label:copyDisabled?copy('Copy link (save first)','Link kopieren (zuerst speichern)'):copy('Copy link to marker','Link zum Verweiszeichen kopieren'),onSelect:onCopyLink,disabled:copyDisabled}]:[])]}/>;
}
