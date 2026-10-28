'use client';

import { cloneElement, useId, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from 'react';
import type { ContentOutline, OrderedNode } from '../../../lib/api';
import { kindByCode, type OutlineKind } from '../../../lib/outline';
import { outlineUnitDetails } from '../../../lib/outline-preview';
import { OrderedContentTree, type OrderedNodeElement } from '../../components/ConstitutionText';
import { useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';

export function OutlineReaderPreview({ roots, outline, label }: { roots: OrderedNode[]; outline: ContentOutline; label?: string }) {
  const [inspected, setInspected] = useState<string | null>(null);
  const id = useId();
  let ordinal = 0;
  return <OrderedContentTree entries={roots.map(node => ({ type: 'child', node }))} outline={outline} idPrefix={`outline-preview-${id}-`}
    renderNode={(node, element) => {
      const kind = kindByCode(outline, node.kind);
      const position = ++ordinal;
      const unitLabel = `${label ? `${label}: ` : ''}${kind?.displayLabel ?? node.kind} ${node.label || position}`;
      return kind ? <PreviewUnit node={node} kind={kind} unitLabel={unitLabel} outline={outline} element={element} inspected={inspected} setInspected={setInspected} /> : element;
    }} />;
}

function PreviewUnit({ node, kind, unitLabel, outline, element, inspected, setInspected }: {
  node: OrderedNode; kind: OutlineKind; unitLabel: string; outline: ContentOutline; element: OrderedNodeElement;
  inspected: string | null; setInspected: Dispatch<SetStateAction<string | null>>;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const t = useTranslation();
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = inspected === node.occurrenceId;
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!root.current || !tooltip.current) return;
      const anchor = root.current.getBoundingClientRect();
      const box = tooltip.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8));
      const top = anchor.bottom + box.height <= window.innerHeight - 8 ? anchor.bottom : Math.max(8, anchor.top - box.height);
      setPosition({ left, top });
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setInspected(current => current === node.occurrenceId ? null : current);
    }
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setInspected(current => current === node.occurrenceId ? null : current);
      }
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('pointerdown', dismissOutside);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open, kind, node.occurrenceId, setInspected]);

  function inspect(event: SyntheticEvent<HTMLElement>) {
    event.stopPropagation();
    setInspected(node.occurrenceId);
  }
  function close() {
    setInspected(current => current === node.occurrenceId ? null : current);
  }
  const attributes = {
    ref: root,
    className: `${element.props.className ?? ''} outline-preview-unit${open ? ' is-inspected' : ''}`.trim(),
    role: 'group',
    tabIndex: 0,
    'data-preview-kind': kind.kindCode,
    'aria-label': t(ui.outlinePreview.configuration).replace('{unit}', unitLabel),
    'aria-describedby': open ? id : undefined,
    onPointerOver: inspect,
    onPointerLeave: () => { if (!root.current?.contains(document.activeElement)) close(); },
    onFocus: inspect,
    onBlur: (event: SyntheticEvent<HTMLElement> & { relatedTarget: EventTarget | null }) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) close();
    },
    onClick: (event: SyntheticEvent<HTMLElement>) => { inspect(event); root.current?.focus({ preventScroll: true }); },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    },
  };
  // cloneElement forwards this ref to the rendered DOM element; it does not read ref.current.
  // eslint-disable-next-line react-hooks/refs
  return cloneElement(element, attributes, <>{element.props.children}{open ? <span ref={tooltip} id={id} role="tooltip" className="outline-preview-tooltip" style={position ?? { visibility: 'hidden' }}>
    <strong>{kind.displayLabel}{node.label ? ` ${node.label}` : ''}</strong>
    {outlineUnitDetails(kind, outline, t).map(detail => <span key={detail}>{detail}</span>)}
  </span> : null}</>);
}
