'use client';

import { useState } from 'react';
import { Button } from './ui';
import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      className="print-hide"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <T value={ui.extraComponents.copyLink.copied} /> : <T value={ui.extraComponents.copyLink.copyLink} />}
    </Button>
  );
}
