'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { translateContentAction } from '../content-translation/actions';
import { T, useLocale } from './TranslationProvider';
import { ui } from '../../lib/messages';

export function ContentTranslation({ children, sourceLanguage, authenticated, enabled, alwaysTranslate }: {
  children: ReactNode;
  sourceLanguage: string;
  authenticated: boolean;
  enabled: boolean;
  alwaysTranslate: boolean;
}) {
  const locale = useLocale();
  const originalRef = useRef<HTMLDivElement>(null);
  const originalTexts = useRef<Map<Text, string>>(new Map());
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
      setTranslated(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [authenticated, enabled, busy, sourceLanguage, locale]);

  useEffect(() => {
    if (alwaysTranslate && authenticated && enabled && sourceLanguage.toLowerCase().split('-')[0] !== locale && !translated && !busy && !failed && !showingOriginal) void translate();
  }, [alwaysTranslate, authenticated, enabled, sourceLanguage, locale, translated, busy, failed, showingOriginal, translate]);

  useEffect(() => { setShowingOriginal(false); }, [sourceLanguage, locale]);

  const showOriginal = () => {
    originalTexts.current.forEach((value, node) => { if (node.isConnected) node.textContent = value; });
    originalTexts.current.clear();
    setShowingOriginal(true);
    setTranslated(false);
  };

  const sameLanguage = sourceLanguage.toLowerCase().split('-')[0] === locale;
  return <section className="content-translation">
    {!sameLanguage ? <div className="inline-actions">
      {translated ? <button type="button" className="btn" onClick={showOriginal}><T value={ui.contentTranslation.showOriginal} /></button>
        : <button type="button" className="btn" onClick={() => { setShowingOriginal(false); void translate(); }} disabled={!authenticated || !enabled || busy}><T value={ui.contentTranslation.translate} /></button>}
      {!authenticated ? <span><Link href="/login"><T value={ui.contentTranslation.loginRequired} /></Link></span> : null}
      {authenticated && !enabled ? <span><T value={ui.contentTranslation.unavailable} /></span> : null}
      {failed ? <span role="alert"><T value={ui.contentTranslation.failed} /></span> : null}
    </div> : null}
    <div ref={originalRef} lang={translated ? locale : sourceLanguage}>{children}</div>
  </section>;
}
