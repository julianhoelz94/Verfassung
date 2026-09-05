'use client';

import { Button } from './ui';

export function PrintLink() {
  return (
    <Button type="button" className="print-hide" onClick={() => window.print()}>
      Print
    </Button>
  );
}
