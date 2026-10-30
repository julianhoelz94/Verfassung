import type { ComponentPropsWithRef, ComponentPropsWithoutRef, HTMLAttributes, ReactNode, Ref } from 'react';
import { PageMain } from '../PageMain';
import styles from './PageChrome.module.css';

export type PageContentsItem = { id: string; href: string; label: ReactNode; description?: ReactNode; children?: PageContentsItem[] };

/** The page body owns its reading measure; shared chrome spans the viewport. */
export function FullWidthPage({ template, className, ...props }: ComponentPropsWithoutRef<'main'> & { template: 'collection' | 'reader' }) {
  return <PageMain {...props} width="content" data-template={template} className={[styles.page, className].filter(Boolean).join(' ')} />;
}

export function PageChromeSurface({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div {...props} className={[styles.surface, className].filter(Boolean).join(' ')} />;
}

export function PageBreadcrumbs({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={[styles.breadcrumbs, className].filter(Boolean).join(' ')} />;
}

export function PageMenuFrame({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div {...props} className={[styles.menuFrame, className].filter(Boolean).join(' ')} />;
}

export function PageMenuBar({ as: Element = 'div', label, className, ...props }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'nav'; label: string }) {
  return <Element {...props} aria-label={label} className={[styles.menuBar, className].filter(Boolean).join(' ')} />;
}

export function PageContentsLayout({ navigation, navigationId, navigationRef, expanded, children }: {
  navigation: ReactNode; navigationId: string; navigationRef?: Ref<HTMLElement>; expanded: boolean; children: ReactNode;
}) {
  return <div className={styles.layout} data-navigation={expanded}>
    <aside ref={navigationRef} className={styles.navigation} hidden={!expanded} id={navigationId}>{navigation}</aside>
    {children}
  </div>;
}

export function PageContentsBody({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section {...props} className={[styles.body, className].filter(Boolean).join(' ')} />;
}

export function PageContentsNavigation({ items, label, title, currentId, onSelect, children }: {
  items: PageContentsItem[]; label: string; title: ReactNode; currentId?: string; onSelect?: (id: string) => void; children?: ReactNode;
}) {
  function list(entries: PageContentsItem[], nested = false): ReactNode {
    return <ol className={nested ? styles.nested : undefined}>{entries.map(item => <li key={item.id}>
      <a href={item.href} aria-current={currentId === item.id ? 'true' : undefined} onClick={() => onSelect?.(item.id)}>{item.label}{item.description ? <span>{item.description}</span> : null}</a>
      {item.children?.length ? list(item.children, true) : null}
    </li>)}</ol>;
  }
  return <nav className={styles.contents} aria-label={label}><h2 className={styles.eyebrow}>{title}</h2>{list(items)}{children}</nav>;
}
