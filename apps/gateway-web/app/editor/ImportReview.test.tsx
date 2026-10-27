import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentOutline, OrderedNode } from '../../lib/api';
import { ImportReview } from './ImportReview';

const clients = vi.hoisted(() => ({
  currentUser: vi.fn(), requireSessionBearer: vi.fn(), getImportJob: vi.fn(),
  getImportPayload: vi.fn(), getImportReviewDecisions: vi.fn(),
  getPreparedImportContent: vi.fn(), getReaderOutline: vi.fn(),
}));

vi.mock('../../lib/session', () => ({ currentUser: clients.currentUser, requireSessionBearer: clients.requireSessionBearer }));
vi.mock('../../lib/ingestion-api', () => ({
  getImportJob: clients.getImportJob, getImportPayload: clients.getImportPayload,
  getImportReviewDecisions: clients.getImportReviewDecisions, getPreparedImportContent: clients.getPreparedImportContent,
}));
vi.mock('../../lib/api', () => ({ getReaderOutline: clients.getReaderOutline }));
vi.mock('../admin/import/actions', () => ({ transitionImportAction: vi.fn() }));
vi.mock('../components/NodeTitleForm', () => ({ NodeTitleForm: () => null }));

const roots: OrderedNode[] = [{
  logicalId: 'article', occurrenceId: 'article-occurrence', revisionId: 'article-revision', kind: 'article', label: 'I', title: 'Rights',
  content: ['Everyone is free.', 'Everyone is equal.'].map((text, index) => ({ type: 'child' as const, node: {
    logicalId: `paragraph-${index}`, occurrenceId: `paragraph-occurrence-${index}`, revisionId: `paragraph-revision-${index}`,
    kind: 'paragraph', label: `(${index + 1})`, title: index ? 'Equality' : 'Freedom',
    content: [{ type: 'text' as const, logicalId: `text-${index}`, occurrenceId: `text-occurrence-${index}`, text }],
  } })),
}];

const currentDisplay: ContentOutline = { kinds: [
  { kindCode: 'article', displayLabel: 'Live article', sortOrder: 1, root: true, allowedChildKinds: ['paragraph'],
    mayHoldChildren: true, mayHoldText: false, presentation: 'section', showKind: true, showLabel: true, showTitle: false },
  { kindCode: 'paragraph', displayLabel: 'Live paragraph', sortOrder: 2, root: false, allowedChildKinds: [],
    mayHoldChildren: false, mayHoldText: true, presentation: 'concatenated', showKind: true, showLabel: true, showTitle: true, labelPlacement: 'superscript' },
] };

async function renderedReview() {
  const markup = renderToStaticMarkup(await ImportReview({ jobId: 'import' }));
  return new DOMParser().parseFromString(markup, 'text/html');
}

function preparedPreview(document: Document) {
  const heading = Array.from(document.querySelectorAll('h2')).find(element => element.textContent === 'Prepared draft as readers will see it');
  expect(heading).toBeDefined();
  return heading!.parentElement!;
}

describe('prepared import reader presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.currentUser.mockResolvedValue({ roles: ['reviewer'] });
    clients.requireSessionBearer.mockResolvedValue('Bearer reviewer-session');
    clients.getImportJob.mockResolvedValue({ id: 'import', status: 'pending_review', versionId: 'private-draft', isoCode: 'XA', errors: [] });
    clients.getImportPayload.mockResolvedValue({ constitutionTitle: 'Charter', versionLabel: 'Original', countryName: 'Testland',
      // The submitted display remains historical; it must not override the live reader presentation.
      outline: { kinds: [{ kindCode: 'article', displayLabel: 'Submitted article', showKind: true }] }, roots });
    clients.getImportReviewDecisions.mockResolvedValue([]);
    clients.getPreparedImportContent.mockResolvedValue({ versionId: 'private-draft', settingsRevisionId: 'pinned-structural-revision', generation: 3, roots });
    clients.getReaderOutline.mockResolvedValue(currentDisplay);
  });

  it('renders current running text and superscripts while retaining the private draft structural pin', async () => {
    const document = await renderedReview();
    const preview = preparedPreview(document);
    expect(clients.getPreparedImportContent).toHaveBeenCalledWith('private-draft', 'Bearer reviewer-session');
    expect(clients.getReaderOutline).toHaveBeenCalledWith('private-draft', 'Bearer reviewer-session');
    expect(preview.querySelector('.node-kind-article > .node-heading')?.textContent).toBe('Live article I');
    expect(preview.querySelector('.constitution-concat')?.textContent).toBe('(1)Everyone is free. (2)Everyone is equal.');
    expect(Array.from(preview.querySelectorAll('sup.num'), element => element.textContent)).toEqual(['(1)', '(2)']);
    expect(preview.querySelector('.constitution-concat .node-heading')).toBeNull();
    expect(document.body.textContent).toContain('pinned-structural-revision');
    expect(document.querySelector('#import-structure')?.textContent).toContain('Live paragraph');
    expect(document.querySelector('#import-structure')?.textContent).not.toContain('Submitted article');
  });

  it('reflects changed display names, separate blocks and label placement without changing source wording', async () => {
    clients.getReaderOutline.mockResolvedValue({ kinds: [currentDisplay.kinds[0], {
      ...currentDisplay.kinds[1], displayLabel: 'Clause', presentation: 'section', labelPlacement: 'after_title',
    }] });
    const preview = preparedPreview(await renderedReview());
    expect(preview.querySelectorAll('.constitution-concat')).toHaveLength(0);
    expect(Array.from(preview.querySelectorAll('.node-kind-paragraph > .node-heading'), element => element.textContent)).toEqual(['Clause Freedom (1)', 'Clause Equality (2)']);
    expect(Array.from(preview.querySelectorAll('.constitution-body'), element => element.textContent)).toEqual(['Everyone is free.', 'Everyone is equal.']);
  });

  it('withholds approval when the private prepared content is unavailable', async () => {
    clients.getPreparedImportContent.mockRejectedValue(new Error('content unavailable'));
    const document = await renderedReview();
    const buttons = Array.from(document.querySelectorAll('button'), element => element.textContent);
    expect(buttons).not.toContain('Approve prepared draft');
    expect(buttons).toContain('Reject import');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('prepared');
  });

  it('keeps prepared source text inspectable when the current presentation service is unavailable', async () => {
    clients.getReaderOutline.mockRejectedValue(new Error('catalog unavailable'));
    const document = await renderedReview();
    const preview = preparedPreview(document);
    expect(Array.from(preview.querySelectorAll('.constitution-body'), element => element.textContent)).toEqual(['Everyone is free.', 'Everyone is equal.']);
    expect(document.body.textContent).toContain('pinned-structural-revision');
  });
});
