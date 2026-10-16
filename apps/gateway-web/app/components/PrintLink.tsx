'use client';

import { T, ui } from './TranslationProvider';
import { Button } from './ui';

export function PrintLink() {
  return (
    <Button type="button" className="print-hide" onClick={() => window.print()}>
      <T value={ui.components.printlink.print} />{" "}</Button>
  );
}
