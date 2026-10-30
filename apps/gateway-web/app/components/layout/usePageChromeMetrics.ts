'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/** Keep sticky menus, mobile contents and anchor offsets below the actual header. */
export function usePageChromeMetrics(root: RefObject<HTMLDivElement | null>, menu: RefObject<HTMLDivElement | null>, navigation: RefObject<HTMLElement | null>) {
  const [readingArea, setReadingArea] = useState({ top: 0, bottom: 0 });
  useLayoutEffect(() => {
    const surface = root.current, bar = menu.current, header = document.querySelector<HTMLElement>('.topbar');
    if (!surface || !bar) return;
    function measure() {
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      const navigationHeight = window.innerWidth <= 680 ? navigation.current?.getBoundingClientRect().height ?? 0 : 0;
      const height = bar!.getBoundingClientRect().height;
      surface!.style.setProperty('--page-header-height', headerHeight + 'px');
      surface!.style.setProperty('--page-menu-height', height + 'px');
      surface!.style.setProperty('--page-navigation-height', navigationHeight + 'px');
      const top = Math.min(headerHeight + height + navigationHeight + 24, window.innerHeight - 1);
      const bottom = Math.max(0, Math.min(window.innerHeight * .45, window.innerHeight - top - 1));
      setReadingArea(previous => previous.top === top && previous.bottom === bottom ? previous : { top, bottom });
    }
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar); if (navigation.current) observer?.observe(navigation.current); if (header) observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [root, menu, navigation]);
  return readingArea;
}

export function useKeepContentsVisible(navigation: RefObject<HTMLElement | null>, currentId: string | undefined, expanded: boolean) {
  useLayoutEffect(() => {
    const list = navigation.current?.querySelector('nav'), selected = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!expanded || !list || !selected) return;
    const item = selected.getBoundingClientRect(), area = list.getBoundingClientRect();
    if (item.top < area.top) list.scrollTop += item.top - area.top;
    else if (item.bottom > area.bottom) list.scrollTop += item.bottom - area.bottom;
  }, [navigation, currentId, expanded]);
}
