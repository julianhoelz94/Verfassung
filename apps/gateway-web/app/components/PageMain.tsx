import type { ReactNode } from 'react';

type PageMainProps = {
  children: ReactNode;
  className?: string;
};

export function PageMain({ children, className }: PageMainProps) {
  const tokens = (className ?? '').split(/\s+/).filter(Boolean);
  const wide = tokens.includes('wide');
  const rest = tokens.filter((token) => token !== 'wide');
  return (
    <main
      id="main-content"
      className={['page', wide ? undefined : 'page-narrow', ...rest].filter(Boolean).join(' ')}
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
