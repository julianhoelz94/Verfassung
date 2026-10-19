'use client';

import { useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';

import { useState, type ReactNode } from 'react';
import { Tabs } from './Tabs';

type CompareTab = 'changes' | 'from' | 'to';

type CompareViewProps = {
  fromLabel: string;
  toLabel: string;
  children: ReactNode;
};

export function CompareView({ fromLabel, toLabel, children }: CompareViewProps) {
  const t = useTranslation();
  const [tab, setTab] = useState<CompareTab>('changes');
  return (
    <div className={`compare-view compare-tab-${tab}`}>
      <Tabs
        ariaLabel={t(ui.accessibility.compareView)}
        controlsId="compare-tab-panels"
        value={tab}
        onChange={(id) => setTab(id as CompareTab)}
        tabs={[
          { id: 'changes', label: t(ui.remainingStatus.changes) },
          { id: 'from', label: fromLabel },
          { id: 'to', label: toLabel },
        ]}
      />
      <div id="compare-tab-panels">{children}</div>
    </div>
  );
}
