import type { ComponentPropsWithoutRef } from 'react';
import styles from './page.module.css';

export type PageWidth = 'reading' | 'content';
type PageMainProps = ComponentPropsWithoutRef<'main'> & { width?: PageWidth };

export function PageMain({ children, className, width = 'reading', ...props }: PageMainProps) {
  return (
    <main
      {...props}
      id="main-content"
      className={['page', styles.page, styles[width], className].filter(Boolean).join(' ')}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
