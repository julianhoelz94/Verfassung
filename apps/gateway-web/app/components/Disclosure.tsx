import type { ReactNode } from 'react';

/** Native disclosure keeps secondary information available without adding a tab stop per hidden control. */
export function Disclosure({ summary, children, open = false, className = '', id }: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
  id?: string;
}) {
  return <details id={id} className={`disclosure ${className}`} open={open}>
    <summary>{summary}</summary>
    <div className="disclosure-body">{children}</div>
  </details>;
}
