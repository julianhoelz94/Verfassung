import type { HTMLAttributes, RefAttributes } from 'react';
import styles from './ConstitutionDocument.module.css';

/** Shared reading surface for published text and editorial previews. */
export function ConstitutionDocument({ className, ...props }: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
  return <div {...props} data-constitution-document className={[styles.document, className].filter(Boolean).join(' ')} />;
}
