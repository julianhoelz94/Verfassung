'use client';

import { useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Languages, LoaderCircle, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { translateContentAction } from '../content-translation/actions';
import { T, useLocale, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { Inline } from './layout/Layout';
import { ContentTranslationControlSlot } from './ContentTranslationControlSlot';
import styles from './ContentTranslation.module.css';

type ContentTranslationProps = {
  children: ReactNode;
  sourceLanguage: string;
  authenticated: boolean;
  enabled: boolean;
  alwaysTranslate: boolean;
  compact?: boolean;
};

export function ContentTranslation(props: ContentTranslationProps) {
  const pathname = usePathname();
  const locale = useLocale();
  return <ContentTranslationBody key={`${pathname}:${locale}:${props.sourceLanguage}`} {...props} />;
}

function ContentTranslationBody({ children, sourceLanguage, authenticated, enabled, alwaysTranslate, compact = false }: ContentTranslationProps) {
  const locale = useLocale();
  const t = useTranslation(), tooltipId = useId();
  const controlSlot = useContext(ContentTranslationControlSlot);
  const originalRef = useRef<HTMLDivElement>(null);
  const originalTexts = useRef<Map<Text, string>>(new Map());
  const originalLanguages = useRef<Map<Element, string>>(new Map());
  const [translated, setTranslated] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const translate = useCallback(async () => {
    if (!authenticated || !enabled || busy || !originalRef.current) return;
    setBusy(true);
    setFailed(false);
    try {
      const walker = document.createTreeWalker(originalRef.current, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.textContent?.trim()
          && node.parentElement?.closest('[data-content-translation]') === originalRef.current
          && node.parentElement?.closest('.constitution-body, .node-heading, .legal-table, .legal-footnote, .wiki-body, [data-translate-content]')
          && !node.parentElement?.closest('script, style, code, pre, [data-no-translate]')) nodes.push(node);
      }
      const splitText = (text: string): string[] => {
        const parts: string[] = [];
        let rest = text;
        while (rest.length > 10_000) {
          const boundary = rest.lastIndexOf(' ', 10_000);
          const end = boundary > 5_000 ? boundary + 1 : 10_000;
          parts.push(rest.slice(0, end));
          rest = rest.slice(end);
        }
        if (rest) parts.push(rest);
        return parts;
      };
      const nodeValues = new Map(nodes.map((node) => [node, splitText(node.textContent!.trim())]));
      const values = [...new Set([...nodeValues.values()].flat().filter((part) => part.trim()))];
      const translations = new Map<string, string>();
      let batch: string[] = [];
      let characters = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        const results = await translateContentAction(batch, sourceLanguage, locale);
        batch.forEach((value, index) => translations.set(value, results[index]));
        batch = [];
        characters = 0;
      };
      for (const value of values) {
        if (batch.length >= 128 || characters + value.length > 20_000) await flush();
        batch.push(value);
        characters += value.length;
      }
      await flush();
      for (const node of nodes) {
        const before = node.textContent ?? '';
        const value = before.trim();
        if (!node.isConnected) continue;
        originalTexts.current.set(node, before);
        const translatedText = nodeValues.get(node)!.map((part) => {
          const result = translations.get(part);
          return result === undefined ? part : `${part.match(/^\s*/)?.[0] ?? ''}${result}${part.match(/\s*$/)?.[0] ?? ''}`;
        }).join('');
        node.textContent = before.replace(value, translatedText);
      }
      originalRef.current.querySelectorAll('[lang]').forEach(element => {
        if (element.closest('code, pre, [data-no-translate]')) return;
        originalLanguages.current.set(element, element.getAttribute('lang')!);
        element.setAttribute('lang', locale);
      });
      setTranslated(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [authenticated, enabled, busy, sourceLanguage, locale]);

  useEffect(() => {
    // Start the requested translation after the authored DOM is mounted; busy state belongs to that external request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (alwaysTranslate && authenticated && enabled && sourceLanguage.toLowerCase().split('-')[0] !== locale && !translated && !busy && !failed && !showingOriginal) void translate();
  }, [alwaysTranslate, authenticated, enabled, sourceLanguage, locale, translated, busy, failed, showingOriginal, translate]);

  const showOriginal = () => {
    originalTexts.current.forEach((value, node) => { if (node.isConnected) node.textContent = value; });
    originalTexts.current.clear();
    originalLanguages.current.forEach((value, element) => { if (element.isConnected) element.setAttribute('lang', value); });
    originalLanguages.current.clear();
    setShowingOriginal(true);
    setTranslated(false);
  };

  const sameLanguage = sourceLanguage.toLowerCase().split('-')[0] === locale;
  const label = t(!authenticated ? ui.contentTranslation.loginRequired : !enabled ? ui.contentTranslation.unavailable : busy ? ui.contentTranslation.translating : translated ? ui.contentTranslation.showOriginal : ui.contentTranslation.translate);
  const Icon = busy ? LoaderCircle : translated ? Undo2 : Languages;
  const iconControl = !sameLanguage ? <span className={styles.toolbar} data-slotted={controlSlot !== undefined}><span className={styles.control}>
    {!authenticated ? <Link href="/login" className={styles.button} aria-label={label} aria-describedby={tooltipId}><Languages className={styles.icon} aria-hidden="true" /></Link> : <button type="button" className={styles.button} aria-label={label} aria-describedby={tooltipId} aria-busy={busy} onClick={() => { if (translated) showOriginal(); else { setShowingOriginal(false); void translate(); } }} disabled={!enabled || busy}><Icon className={[styles.icon, busy ? styles.busy : ''].join(' ')} aria-hidden="true" /></button>}
    <span id={tooltipId} role="tooltip" className={styles.tooltip}>{label}</span>
  </span></span> : null;
  return <div className={['content-translation', compact ? styles.wiki : ''].join(' ')}>
    {compact ? controlSlot === undefined ? iconControl : controlSlot ? createPortal(iconControl, controlSlot) : null : !sameLanguage ? <Inline className="inline-actions">
      {translated ? <button type="button" className="btn" onClick={showOriginal}><T value={ui.contentTranslation.showOriginal} /></button>
        : <button type="button" className="btn" onClick={() => { setShowingOriginal(false); void translate(); }} disabled={!authenticated || !enabled || busy}><T value={ui.contentTranslation.translate} /></button>}
      {!authenticated ? <span><Link href="/login"><T value={ui.contentTranslation.loginRequired} /></Link></span> : null}
      {authenticated && !enabled ? <span><T value={ui.contentTranslation.unavailable} /></span> : null}
      {failed ? <span role="alert"><T value={ui.contentTranslation.failed} /></span> : null}
    </Inline> : null}
    {compact && failed ? <p className={styles.error} role="alert"><T value={ui.contentTranslation.failed} /></p> : null}
    <div ref={originalRef} data-content-translation lang={translated ? locale : sourceLanguage === 'auto' ? undefined : sourceLanguage}>{children}</div>
  </div>;
}
