import type { HTMLAttributes, RefAttributes } from 'react';
import styles from './ConstitutionDocument.module.css';

/** Shared reading surface for published text and editorial previews. */
export function ConstitutionDocument({ className,
  indentation = true,
  guides = true,
  ...props }: HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement> & { indentation?: boolean; guides?: boolean }) {
  return <div {...props} data-constitution-document
      data-hierarchy-indentation={indentation}
      data-hierarchy-guides={indentation && guides}
      className={[styles.document, className].filter(Boolean).join(' ')} />;
}
