'use client';

import { useState, type ReactNode } from 'react';
import { Tabs } from './Tabs';

type CompareTab = 'changes' | 'from' | 'to';

type CompareViewProps = {
  fromLabel: string;
  toLabel: string;
  children: ReactNode;
};

export function CompareView({ fromLabel, toLabel, children }: CompareViewProps) {
  const [tab, setTab] = useState<CompareTab>('changes');
  return (
    <div className={`compare-view compare-tab-${tab}`}>
      <Tabs
        ariaLabel="Compare view"
        controlsId="compare-tab-panels"
        value={tab}
        onChange={(id) => setTab(id as CompareTab)}
        tabs={[
          { id: 'changes', label: 'Changes' },
          { id: 'from', label: fromLabel },
          { id: 'to', label: toLabel },
        ]}
      />
      <div id="compare-tab-panels">{children}</div>
    </div>
  );
}
