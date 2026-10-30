'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BookText } from 'lucide-react';
import type { UiMessage } from '../../lib/messages';
import { directoryUi } from '../../lib/country-directory-messages';
import { readerUi } from '../../lib/reader-messages';
import { useTranslation } from './TranslationProvider';
import { ReaderIcon } from './ReaderIcon';
import { PageChromeSurface, PageContentsBody, PageContentsLayout, PageContentsNavigation, PageMenuBar, PageMenuFrame, type PageContentsItem } from './layout/PageChrome';
import { useKeepContentsVisible, usePageChromeMetrics } from './layout/usePageChromeMetrics';
import styles from './CountryDirectory.module.css';

function flatten(items: PageContentsItem[]): PageContentsItem[] {
  return items.flatMap(item => [item, ...flatten(item.children ?? [])]);
}

export function ConstitutionDirectoryFrame({ background, contents, children, toolsLabel = directoryUi.tools }: {
  background?: ReactNode; contents: PageContentsItem[]; children: ReactNode; toolsLabel?: UiMessage;
}) {
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(true);
  const [current, setCurrent] = useState(contents[0]?.id);
  const surface = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  const backgroundButton = useRef<HTMLButtonElement>(null), anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const readingArea = usePageChromeMetrics(surface, menu, navigation);
  useKeepContentsVisible(navigation, current, expanded);
  const id = useId(), t = useTranslation();

  useEffect(() => {
    const targets = flatten(contents).map(item => document.getElementById(item.id)).filter((node): node is HTMLElement => Boolean(node));
    let frame = 0;
    function update() {
      frame = 0;
      const linked = targets.find(target => target.id === window.location.hash.slice(1));
      if (linked) {
        const bounds = linked.getBoundingClientRect();
        if (bounds.top >= readingArea.top - 1 && bounds.top < window.innerHeight) { setCurrent(linked.id); return; }
      }
      const passed = targets.filter(target => target.getBoundingClientRect().top <= readingArea.top + 1);
      setCurrent(passed[passed.length - 1]?.id ?? contents[0]?.id);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); window.removeEventListener('hashchange', schedule); };
  }, [contents, readingArea.top]);

  useLayoutEffect(() => {
    const previous = anchor.current; anchor.current = null;
    if (previous?.element.isConnected) window.scrollBy?.(0, previous.element.getBoundingClientRect().top - previous.top);
  }, [expanded]);

  function toggleContents() {
    const element = current ? document.getElementById(current) : null;
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
    setExpanded(value => !value);
  }

  return <PageChromeSurface ref={surface}>
    <PageMenuFrame ref={menu} onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); backgroundButton.current?.focus(); } }}>
      <PageMenuBar as="nav" label={t(toolsLabel)}>
        <button type="button" className={styles.tool} aria-label={t(expanded ? readerUi.hideContents : readerUi.showContents)} aria-expanded={expanded} aria-controls="directory-contents" onClick={toggleContents}><ReaderIcon name="contents" />{t(readerUi.contents)}</button>
        {background ? <button ref={backgroundButton} type="button" className={styles.tool} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><BookText aria-hidden="true" />{t(directoryUi.background)}</button> : null}
      </PageMenuBar>
      {background ? <section id={id} className={styles.background} aria-label={t(directoryUi.background)} hidden={!open}>{background}</section> : null}
    </PageMenuFrame>
    <PageContentsLayout expanded={expanded} navigationId="directory-contents" navigationRef={navigation} navigation={
      <PageContentsNavigation items={contents} label={t(readerUi.contents)} title={t(directoryUi.onThisPage)} currentId={current} onSelect={setCurrent} />
    }><PageContentsBody className={styles.contentsBody}>{children}</PageContentsBody></PageContentsLayout>
  </PageChromeSurface>;
}
