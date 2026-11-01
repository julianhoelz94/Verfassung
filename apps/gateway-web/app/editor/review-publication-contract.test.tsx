import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChangeRecordChange } from '../../lib/editor-api';
import type { DiffReviewState, ReviewCandidate } from '../../lib/diff-review';
import type { StructuredPreview } from '../../lib/structured-editor';
import { TranslationProvider } from '../components/TranslationProvider';
import { DiffReviewQueue } from './DiffReviewQueue';
import { PublishForm } from './PublishForm';
import { ChangeOverview } from './ChangeOverview';

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  routerRefresh: vi.fn(),
}));
vi.mock('./diff-review-actions', () => ({
  saveDiffDecisionAction: actions.save,
  refreshDiffReviewAction: actions.refresh,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actions.routerRefresh }),
}));
afterEach(() => vi.clearAllMocks());
const draft: StructuredPreview = {
  sessionId: 's',
  sourceVersionId: 'v',
  sourceGeneration: 1,
  settingsRevisionId: 'settings',
  generation: 1,
  sourceRoots: [],
  roots: [],
  operations: [],
};
const before = { versionId: 'v', logicalId: 'before' },
  after = { logicalId: 'after' };

it.each([
  ['added', null, null, null, false],
  ['added', null, after, null, true],
  ['added', null, null, 'pending', true],
  ['removed', null, after, null, false],
  ['removed', before, null, null, true],
  ['changed', before, null, null, false],
  ['changed', null, after, null, false],
  ['changed', before, after, null, true],
  ['changed', before, null, 'pending', true],
] as const)(
  'keeps the %s publication boundary for before=%j after=%j pending=%j',
  (changeType, beforeRef, afterRef, pendingAfterLogicalId, ready) => {
    const change: ChangeRecordChange = {
      articleId: 'article',
      articleNumber: '1',
      changeType,
      beforeRef,
      afterRef,
      pendingAfterLogicalId,
    };
    const markup = renderToStaticMarkup(
      <PublishForm
        sessionId="s"
        versionId="v"
        articleId="article"
        hopKind="legal"
        status="approved"
        canEdit={false}
        canPublish
        structuredDraft={draft}
        sourceEvidenceRevision={7}
        record={{
          title: 'Law',
          comment: 'Exact',
          documents: [],
          changes: [change],
        }}
      />,
    );
    const dom = new DOMParser().parseFromString(markup, 'text/html');
    const form = dom.querySelector('form')!;
    expect(form.getAttribute('action')).toBe('/editor/command');
    expect(
      form.querySelector<HTMLInputElement>('[name="command"]')?.value,
    ).toBe('publish');
    expect(
      form.querySelector<HTMLInputElement>('[name="sourceEvidenceRevision"]')
        ?.value,
    ).toBe('7');
    expect(form.querySelector('button')?.disabled).toBe(!ready);
  },
);

function review(): DiffReviewState {
  const candidate = (key: string): ReviewCandidate => ({
    key,
    fingerprint: `fp-${key}`,
    facet: 'text_changed',
    level: 2,
    ambiguous: false,
    groupKey: null,
    beforeRefs: [
      {
        logicalId: key,
        kind: 'text_entry',
        path: [key],
        excerpt: `Old ${key}`,
      },
    ],
    afterRefs: [
      {
        logicalId: key,
        kind: 'text_entry',
        path: [key],
        excerpt: `New ${key}`,
      },
    ],
  });
  return {
    revisionId: 'r',
    sourceVersionId: 'source',
    targetVersionId: 'target',
    candidates: [candidate('one'), candidate('two')],
    decisions: [],
    totals: { total: 2, resolved: 0 },
    currentPosition: 2,
  };
}

it('restores the saved position, focuses navigation and retains an unsaved exclusion after a failed save', async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  actions.save.mockResolvedValue({ error: 'Exact rejection' });
  try {
    await act(async () =>
      root.render(
        <DiffReviewQueue
          target={{ kind: 'editor', id: 'session' }}
          initial={review()}
          rows={[]}
          canDecide
          canAcknowledge={false}
        />,
      ),
    );
    expect(host.textContent).toContain('Difference 2 of 2');
    await act(async () =>
      fireEvent.click(getByRole(host, 'button', { name: 'Previous' })),
    );
    expect(document.activeElement).toBe(
      host.querySelector('.diff-review-active'),
    );
    await act(async () =>
      fireEvent.change(host.querySelector('textarea')!, {
        target: { value: '  precise reason  ' },
      }),
    );
    await act(async () =>
      fireEvent.click(
        getByRole(host, 'button', { name: 'Exclude with reason and next' }),
      ),
    );
    expect(actions.save.mock.calls[0][2]).toEqual({
      key: 'one',
      fingerprint: 'fp-one',
      status: 'excluded_with_reason',
      exclusionReason: 'precise reason',
      reviewerAcknowledged: false,
    });
    expect(host.querySelector('textarea')?.value).toBe('  precise reason  ');
    expect(host.textContent).toContain('Exact rejection');
    expect(host.textContent).toContain('Difference 1 of 2');
    expect(actions.routerRefresh).not.toHaveBeenCalled();
    expect(
      (getByRole(host, 'button', { name: 'Refresh' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps formatting description order and German wording for combined rich changes', () => {
  const content = {
    lineBreaksBefore: 1,
    format: 'footnote',
    footnoteLabel: 'a',
    table: { caption: 'Caption', rows: [{ cells: [{ text: 'Cell' }] }] },
    marks: [{ type: 'bold', start: 0, end: 2 }],
    references: [
      { target: { type: 'external', url: 'https://example.test' } },
      { target: { type: 'footnote' } },
      { target: { type: 'node', logicalId: 'article' } },
    ],
    annotation: { attribution: 'Archive' },
  };
  const markup = renderToStaticMarkup(
    <TranslationProvider locale="de">
      <ChangeOverview
        outline={{ kinds: [{ kindCode: 'article', displayLabel: 'Artikel' }] }}
        roots={[
          { logicalId: 'article', kind: 'article', label: '1', content: [] },
        ]}
        sourceRoots={[]}
        onNavigate={() => {}}
        differences={[
          {
            logicalId: 'text',
            rootId: 'article',
            field: 'rich',
            before: 'null',
            after: JSON.stringify(content),
            afterText: 'Exact',
          },
        ]}
      />
    </TranslationProvider>,
  );
  const dom = new DOMParser().parseFromString(markup, 'text/html');
  const versions = dom.querySelector('[class*="versions"]')!;
  expect(versions.textContent).toContain('Texteigenschaften geändert');
  expect(versions.textContent).toContain(
    '1 Zeilenumbruch davor · Fußnote a · Caption\nCell · Fett Zeichen 1–2 · https://example.test · Fußnotenverweis · Artikel 1 · Anmerkung: Archive',
  );
});
