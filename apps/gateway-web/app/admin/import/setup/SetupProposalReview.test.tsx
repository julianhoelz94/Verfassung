import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('./actions', () => ({ reviewSetupAction: vi.fn() }));
import type { SetupProposal } from '../../../../lib/ingestion-api';
import { SetupProposalReview } from './SetupProposalReview';

it('offers continuation of the frozen revision without editable settings or feedback actions', () => {
  const proposal = { id: 'proposal', status: 'confirming', revision: 4, previousPayload: null, requestedChanges: null, changesRequested: false,
    payload: { outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [] }] }, sampleRoots: [] },
  } as unknown as SetupProposal;
  const html = renderToStaticMarkup(<SetupProposalReview proposal={proposal} error="running" />);
  expect(html).toContain('Resume confirmation');
  expect(html).toContain('try again in two minutes');
  expect(html).toContain('name="revision" value="4"');
  expect(html).not.toContain('value="display"');
  expect(html).not.toContain('value="request-changes"');
  expect(html).not.toContain('value="withdraw"');
});

it('explains a correctable creation rejection without calling the reviewed revision stale', () => {
  const proposal = { id: 'proposal', status: 'proposed', revision: 4, previousPayload: null, requestedChanges: null, changesRequested: false,
    payload: { outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [] }] }, sampleRoots: [] },
  } as unknown as SetupProposal;
  const html = renderToStaticMarkup(<SetupProposalReview proposal={proposal} error="creation_rejected" />);
  expect(html).toContain('Review and correct the proposal before confirming again.');
  expect(html).not.toContain('The proposal changed.');
  expect(html).not.toContain('setup_creation_rejected');
  expect(html).toContain('value="display"');
});
