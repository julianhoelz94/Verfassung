import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { PageMain, type PageWidth } from '../PageMain';
import { Stack, type LayoutGap } from './Layout';
import styles from './templates.module.css';

type PageProps = {
  header?: ReactNode;
  notices?: ReactNode;
  children?: ReactNode;
  width?: PageWidth;
  className?: string;
  gap?: LayoutGap;
};

function PageFrame({
  header,
  notices,
  children,
  width = 'content',
  className,
  gap = 'section',
  template,
}: PageProps & { template: string }) {
  return (
    <PageMain width={width} className={className} data-template={template}>
      <Stack gap={gap}>
        {header}
        {notices ? (
          <Stack gap="related" className={styles.notices}>
            {notices}
          </Stack>
        ) : null}
        {children}
      </Stack>
    </PageMain>
  );
}

export function FocusedPage(props: PageProps) {
  return <PageFrame width="reading" {...props} template="focused" />;
}

export function CollectionPage(props: PageProps) {
  return <PageFrame {...props} template="collection" />;
}

export function ReaderPage(props: PageProps) {
  return <PageFrame width="reading" {...props} template="reader" />;
}

export function WorkspacePage(props: PageProps) {
  return <PageFrame {...props} template="workspace" />;
}

export function SettingsPage({ navigation, children, ...props }: PageProps & { navigation: ReactNode }) {
  return (
    <PageFrame {...props} template="settings">
      <div className={styles.settings}>
        <div className={styles.settingsNavigation}>{navigation}</div>
        <Stack gap="card" className={styles.settingsContent}>
          {children}
        </Stack>
      </div>
    </PageFrame>
  );
}

type ContentLayoutProps = ComponentPropsWithoutRef<'div'>;

/** Shared responsive reader grid. The table of contents has its own mobile disclosure. */
export function ReaderLayout({
  navigation,
  children,
  className,
  ...props
}: ContentLayoutProps & { navigation: ReactNode }) {
  return (
    <div {...props} className={[styles.reader, className].filter(Boolean).join(' ')}>
      <aside className={styles.readerNavigation}>{navigation}</aside>
      <div className={styles.main}>{children}</div>
    </div>
  );
}

export function WorkspaceLayout({
  children,
  className,
  variant = 'editor',
  ...props
}: ContentLayoutProps & { variant?: 'editor' | 'amendment' }) {
  return (
    <div {...props} className={[styles.workspace, styles[variant], className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function FilterLayout({ children, className, ...props }: ContentLayoutProps) {
  return (
    <div {...props} className={[styles.filters, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
