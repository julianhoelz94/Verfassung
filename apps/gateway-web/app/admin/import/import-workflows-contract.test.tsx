import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJob, SetupProposal } from '../../../lib/ingestion-api';
import type { MigrationRun } from '../../../lib/migration-review';
import AdminImportPage from './page';
import MigrationReviewPage from '../migrations/[id]/page';
import { ImportReview } from '../../editor/ImportReview';
import { SetupProposalReview } from './setup/SetupProposalReview';

const clients = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireSessionBearer: vi.fn(),
  listImportJobs: vi.fn(),
  getImportJob: vi.fn(),
  getImportPayload: vi.fn(),
  getPreparedImportContent: vi.fn(),
  getImportReviewDecisions: vi.fn(),
  getReaderOutline: vi.fn(),
  getVersionSettings: vi.fn(),
  getMigrationRun: vi.fn(),
  getMigrationRuns: vi.fn(),
  getMigrationAttempts: vi.fn(),
  getImportFidelity: vi.fn(),
  readCapturedSource: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('../../../lib/session', () => ({
  currentUser: clients.currentUser,
  requireSessionBearer: clients.requireSessionBearer,
}));
vi.mock('../../../lib/ingestion-api', async (original) => ({
  ...(await original<typeof import('../../../lib/ingestion-api')>()),
  ...Object.fromEntries(
    [
      'listImportJobs',
      'getImportJob',
      'getImportPayload',
      'getPreparedImportContent',
      'getImportReviewDecisions',
    ].map((name) => [name, clients[name as keyof typeof clients]]),
  ),
}));
vi.mock('../../../lib/api', async (original) => ({
  ...(await original<typeof import('../../../lib/api')>()),
  getReaderOutline: clients.getReaderOutline,
  getVersionSettings: clients.getVersionSettings,
}));
vi.mock('../../../lib/migration-review', async (original) => ({
  ...(await original<typeof import('../../../lib/migration-review')>()),
  getMigrationRun: clients.getMigrationRun,
  getMigrationRuns: clients.getMigrationRuns,
  getMigrationAttempts: clients.getMigrationAttempts,
  getImportFidelity: clients.getImportFidelity,
  readCapturedSource: clients.readCapturedSource,
}));
vi.mock('./actions', () => ({
  createImportAction: vi.fn(),
  createSetupProposalAction: vi.fn(),
  transitionImportAction: vi.fn(),
  prepareImportPackageAction: vi.fn(),
}));
vi.mock('./setup/actions', () => ({ reviewSetupAction: vi.fn() }));
vi.mock('../migrations/actions', () => ({ prepareMigrationAction: vi.fn() }));
vi.mock('../../components/NodeTitleForm', () => ({ NodeTitleForm: () => null }));

const job = {
  id: 'job/a',
  status: 'pending_review',
  versionId: 'draft',
  isoCode: 'XA',
  errors: [],
} as ImportJob;
const proposal = {
  id: 'proposal',
  revision: 3,
  status: 'proposed',
  changesRequested: false,
  previousPayload: null,
  requestedChanges: null,
  payload: {
    constitutionTitle: 'Charter',
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: [] }] },
    sampleRoots: [],
  },
} as unknown as SetupProposal;
const migration = {
  id: 'run',
  manifest: {
    runKey: 'run',
    title: 'Migration',
    sources: [
      {
        sourceKey: 'source a',
        captureKey: 'capture',
        targetKeys: ['target'],
        url: 'https://example.test',
        aliases: [],
        disposition: 'included',
      },
    ],
  },
  coverage: { prepared: 1, staged: 2, sources: 1, unavailable: 0, excluded: 0 },
  items: [
    {
      id: 'capture',
      sourceKey: 'capture',
      dependencies: [],
      kind: 'document',
      state: 'prepared',
      attempts: 1,
      result: { documentId: 'doc', revision: 2 },
    },
    {
      id: 'target',
      sourceKey: 'target',
      dependencies: ['capture'],
      kind: 'version',
      state: 'staged',
      attempts: 2,
      result: { versionId: 'draft', jobId: 'job' },
    },
  ],
} as unknown as MigrationRun;

beforeEach(() => {
  vi.resetAllMocks();
  clients.currentUser.mockResolvedValue({ roles: ['editor', 'reviewer', 'publisher'] });
  clients.requireSessionBearer.mockResolvedValue('Bearer session');
  clients.listImportJobs.mockResolvedValue([job]);
  clients.getImportJob.mockResolvedValue(job);
  clients.getImportPayload.mockResolvedValue({
    constitutionTitle: 'Charter',
    versionLabel: 'Original',
    roots: [],
  });
  clients.getImportReviewDecisions.mockResolvedValue([]);
  clients.getPreparedImportContent.mockResolvedValue({ roots: [], generation: 7, settingsRevisionId: 'pin' });
  clients.getReaderOutline.mockResolvedValue(null);
  clients.getVersionSettings.mockResolvedValue(null);
  clients.getMigrationRun.mockResolvedValue(migration);
  clients.getMigrationRuns.mockResolvedValue([]);
  clients.getMigrationAttempts.mockResolvedValue({ items: [], nextOffset: null });
  clients.getImportFidelity.mockResolvedValue(null);
  clients.readCapturedSource.mockResolvedValue('A'.repeat(60001));
});
function documentOf(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

describe('import administration contracts', () => {
  it('checks access before reading jobs and retains the login destination', async () => {
    clients.currentUser.mockResolvedValue(null);
    await expect(AdminImportPage({ searchParams: Promise.resolve({ mode: 'new' }) })).rejects.toThrow(
      'redirect:/login?next=%2Fadmin%2Fimport%3Fmode%3Dnew',
    );
    expect(clients.listImportJobs).not.toHaveBeenCalled();
    clients.currentUser.mockResolvedValue({ roles: ['reader'] });
    expect(renderToStaticMarkup(await AdminImportPage({ searchParams: Promise.resolve({}) }))).toContain(
      'Administrator role required.',
    );
    expect(clients.requireSessionBearer).not.toHaveBeenCalled();
  });
  it('uses the selected upload contract and encodes job links without exposing staging to reviewers', async () => {
    const doc = documentOf(
      renderToStaticMarkup(
        await AdminImportPage({ searchParams: Promise.resolve({ mode: 'new', error: 'json' }) }),
      ),
    );
    expect(doc.querySelector('#structure #proposalFile')).not.toBeNull();
    expect(doc.querySelector('#structure textarea')?.getAttribute('name')).toBe('proposal');
    expect(doc.querySelector('details')?.hasAttribute('open')).toBe(true);
    expect(doc.querySelector('a[href="/editor?importJobId=job%2Fa"]')).not.toBeNull();
    clients.currentUser.mockResolvedValue({ roles: ['reviewer'] });
    const reviewer = documentOf(
      renderToStaticMarkup(await AdminImportPage({ searchParams: Promise.resolve({}) })),
    );
    expect(reviewer.querySelector('input[type="file"]')).toBeNull();
    expect(reviewer.querySelector('.task-list')).not.toBeNull();
  });
  it('keeps an unavailable job list distinct from an empty list', async () => {
    clients.listImportJobs.mockRejectedValue(new Error('offline'));
    const doc = documentOf(
      renderToStaticMarkup(await AdminImportPage({ searchParams: Promise.resolve({}) })),
    );
    expect(doc.querySelector('[role="alert"]')).not.toBeNull();
    expect(doc.querySelector('.task-list')).toBeNull();
  });
});

describe('import review workflow contracts', () => {
  it('retains parallel optional reads and suppresses approval without a prepared snapshot', async () => {
    clients.getPreparedImportContent.mockRejectedValue(new Error('offline'));
    clients.getImportReviewDecisions.mockRejectedValue(new Error('offline'));
    clients.getReaderOutline.mockRejectedValue(new Error('offline'));
    const doc = documentOf(renderToStaticMarkup(await ImportReview({ jobId: 'job/a', error: 'reason' })));
    expect(doc.querySelector('button[value="approve"]')?.hasAttribute('disabled')).toBe(true);
    expect(doc.querySelector('button[value="reject"]')).not.toBeNull();
    expect(clients.getImportPayload).toHaveBeenCalledWith('job/a', 'Bearer session');
    expect(clients.getReaderOutline).toHaveBeenCalledWith('draft', 'Bearer session');
    expect(doc.querySelector('textarea[name="reason"]')?.getAttribute('minlength')).toBe('10');
  });
  it('keeps successful public links encoded and unknown errors safe', async () => {
    clients.getImportJob.mockResolvedValue({
      ...job,
      status: 'completed',
      isoCode: 'X A',
      versionId: 'version/a',
    });
    const doc = documentOf(
      renderToStaticMarkup(await ImportReview({ jobId: 'job/a', error: 'private-error' })),
    );
    expect(doc.querySelector('a[href="/countries/X%20A/versions/version%2Fa"]')).not.toBeNull();
    expect(doc.body.textContent).not.toContain('private-error');
    expect(doc.querySelector('code')?.textContent).toBe('job/a');
  });
  it('stops before optional reads on missing or unavailable jobs', async () => {
    clients.getImportJob.mockResolvedValue(null);
    await expect(ImportReview({ jobId: 'missing' })).rejects.toThrow('notFound');
    expect(clients.getImportPayload).not.toHaveBeenCalled();
    clients.getImportJob.mockRejectedValue(new Error('offline'));
    expect(renderToStaticMarkup(await ImportReview({ jobId: 'missing' }))).toContain('unavailable');
    expect(clients.getImportPayload).not.toHaveBeenCalled();
  });
});

describe('setup review presentation contracts', () => {
  it('keeps display edits and final confirmation in a single pinned form', () => {
    const doc = documentOf(renderToStaticMarkup(<SetupProposalReview proposal={proposal} />));
    expect(doc.querySelectorAll('form')).toHaveLength(1);
    expect(doc.querySelector('input[name="revision"]')?.getAttribute('value')).toBe('3');
    expect(doc.querySelector('input[name="display"]')?.getAttribute('value')).toContain('Article');
    expect(doc.querySelector('button[value="confirm"]')?.hasAttribute('disabled')).toBe(false);
    expect(doc.querySelector('button[value="request-changes"]')?.hasAttribute('disabled')).toBe(true);
    expect(doc.querySelector('button[value="withdraw"]')?.hasAttribute('formnovalidate')).toBe(true);
  });
  it('retains metadata comparison labels, recorded feedback and changed-status precedence', () => {
    const changed = {
      ...proposal,
      changesRequested: true,
      requestedChanges: 'Keep this feedback.',
      previousPayload: { ...proposal.payload, languageCode: 'de', sourceUrl: 'https://old.test' },
      payload: { ...proposal.payload, languageCode: 'en', sourceUrl: 'https://new.test' },
    };
    const doc = documentOf(renderToStaticMarkup(<SetupProposalReview proposal={changed} />));
    expect(doc.querySelector('h2')?.textContent).toBe('Waiting for a revised proposal');
    expect(doc.body.textContent).toContain('Keep this feedback.');
    expect(doc.querySelectorAll('dl > div')).toHaveLength(2);
    expect(doc.querySelector('button[value="confirm"]')?.hasAttribute('disabled')).toBe(true);
  });
  it('retains the frozen confirmation view without editable display or feedback controls', () => {
    const doc = documentOf(
      renderToStaticMarkup(
        <SetupProposalReview proposal={{ ...proposal, status: 'confirming' }} error="stale" />,
      ),
    );
    expect(doc.querySelector('button[value="confirm"]')).not.toBeNull();
    expect(doc.querySelector('button[value="display"]')).toBeNull();
    expect(doc.querySelector('textarea')).toBeNull();
    expect(doc.querySelector('[role="alert"]')?.textContent).toContain('changed');
  });
});

describe('migration review selection and evidence contracts', () => {
  it('selects source aliases and preserves pinned reads and pagination links', async () => {
    const doc = documentOf(
      renderToStaticMarkup(
        await ImportReview({ runId: 'run',
          query: {
            item: 'target',
            source: 'source a',
            sourceOffset: '30000',
            attemptOffset: '-3',
          },
        }),
      ),
    );
    expect(clients.readCapturedSource).toHaveBeenCalledWith(
      migration.items[0],
      migration.manifest.sources[0],
      'Bearer session',
    );
    expect(clients.getPreparedImportContent).toHaveBeenCalledWith('draft', 'Bearer session');
    expect(clients.getMigrationAttempts).toHaveBeenCalledWith('run', 'target', 0, 'Bearer session');
    expect(clients.getReaderOutline).toHaveBeenCalledWith('draft', 'Bearer session');
    expect(doc.querySelector('pre')?.textContent).toHaveLength(30000);
    expect(
      doc.querySelector('a[href="/admin/import/packages/run?source=source+a&sourceOffset=60000&display=source&item=target"]'),
    ).not.toBeNull();
    expect(doc.querySelector('a[href="/documents/doc?revision=2"]')).not.toBeNull();
  });
  it('keeps selected review details independent of list filters and withholds prepare from reviewers', async () => {
    clients.currentUser.mockResolvedValue({ roles: ['reviewer'] });
    const doc = documentOf(
      renderToStaticMarkup(
        await ImportReview({ runId: 'run',
          query: { item: 'target', state: 'prepared' },
        }),
      ),
    );
    expect(doc.querySelector('button[value="approve"]')).not.toBeNull();
    expect(doc.querySelector('button[value="prepare"]')).toBeNull();
    expect(clients.getPreparedImportContent).toHaveBeenCalled();
  });
  it('shows failed evidence without erasing the prepared text or download link', async () => {
    clients.readCapturedSource.mockRejectedValue(new Error('checksum'));
    const doc = documentOf(
      renderToStaticMarkup(
        await ImportReview({ runId: 'run',
          query: { item: 'target' },
        }),
      ),
    );
    expect(doc.querySelector('[role="alert"]')).not.toBeNull();
    expect(doc.querySelector('pre')).toBeNull();
    expect(doc.querySelector('a[href="/documents/doc?revision=2"]')).not.toBeNull();
    expect(clients.getPreparedImportContent).toHaveBeenCalled();
  });
});

it('redirects former migration review links into the unified package workspace', async () => {
 await expect(MigrationReviewPage({params: Promise.resolve({id:'run'}), searchParams: Promise.resolve({item:'target', source:'source a'})})).rejects.toThrow('redirect:/admin/import/packages/run?item=target&source=source+a');
});
