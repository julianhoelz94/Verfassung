import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import * as api from '../../lib/api';
import * as editor from '../../lib/editor-api';
import { currentUser } from '../../lib/session';
import type { ComponentProps } from 'react';
import type { StructuredEditor } from './StructuredEditor';
import type { StructuredPreview } from '../../lib/structured-editor';
import { cookieJar } from '../../test/server-boundary';
import { article, countryFixture, original } from '../../test/reader-fixtures';
import EditorPage from './page';

vi.mock('../../lib/api', async (originalModule) => ({
  ...(await originalModule<typeof import('../../lib/api')>()),
  listCountries: vi.fn(),
  getCountry: vi.fn(),
  getVersion: vi.fn(),
  getVersionSettings: vi.fn(),
  listAllUnits: vi.fn(),
  listAllArticles: vi.fn(),
  getArticle: vi.fn(),
  getUnit: vi.fn(),
}));
vi.mock('../../lib/editor-api', async (originalModule) => ({
  ...(await originalModule<typeof import('../../lib/editor-api')>()),
  getDraftPreview: vi.fn(),
  getStructuredDraft: vi.fn(),
  getEditorDiffReview: vi.fn(),
}));
vi.mock('../../lib/session', () => ({
  SESSION_COOKIE: 'ca_session',
  currentUser: vi.fn(),
  requireSessionBearer: async () => 'Bearer staff-session',
}));
vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('./StructuredEditor', () => ({
  StructuredEditor: (props: ComponentProps<typeof StructuredEditor>) => {
    structuredProps = props;
    return <p>Structured root {props.rootId}</p>;
  },
}));
vi.mock('./documents/DocumentLinks', () => ({ DocumentLinks: () => null }));
vi.mock('./wiki/WikiWorkspace', () => ({ ConstitutionWikiPanel: () => null }));
vi.mock('./ConstitutionDetailsWorkspace', () => ({
  ConstitutionDetailsWorkspace: () => null,
}));
vi.mock('./SourceEvidenceWorkspace', () => ({
  SourceEvidenceWorkspace: (props: Record<string, unknown>) => {
    sourceProps = props;
    return <p>Source workspace</p>;
  },
}));
vi.mock('./EditorLanding', () => ({
  EditorLanding: () => <p>Session list</p>,
}));
vi.mock('./ImportReview', () => ({ ImportReview: () => <p>Import review</p> }));
let preview: editor.DraftPreview;
let structured: StructuredPreview;
let structuredProps: ComponentProps<typeof StructuredEditor> | undefined;
let sourceProps: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  structuredProps = undefined;
  sourceProps = undefined;
  vi.mocked(currentUser).mockResolvedValue({
    id: 'author',
    email: 'author@example.test',
    roles: ['editor'],
  });
  vi.mocked(cookies).mockResolvedValue(
    cookieJar({ ca_session: 'staff-session' }) as unknown as Awaited<
      ReturnType<typeof cookies>
    >,
  );
  vi.mocked(api.listCountries).mockResolvedValue([
    { id: 'country', isoCode: 'XA', name: 'Test Republic', versionCount: 2 },
  ]);
  vi.mocked(api.getCountry).mockResolvedValue(countryFixture());
  vi.mocked(api.getVersion).mockResolvedValue({
    ...original,
    constitutionId: 'charter',
    publicationStatus: 'published',
    countryCode: 'XA',
  });
  vi.mocked(api.getVersionSettings).mockResolvedValue({
    id: 'settings',
    predecessorId: null,
    outline: { kinds: [] },
  });
  const first = article('old-1', '1', 'First text');
  const second = article('old-2', '2', 'Second text');
  vi.mocked(api.listAllUnits).mockResolvedValue([first, second]);
  vi.mocked(api.listAllArticles).mockResolvedValue([first, second]);
  vi.mocked(api.getUnit).mockResolvedValue({
    ...first,
    body: 'First text',
    title: 'First',
  });
  vi.mocked(api.getArticle).mockResolvedValue({
    ...first,
    body: 'First text',
    title: 'First',
  });
  preview = {
    session: {
      id: 'session',
      actorId: 'author',
      versionId: original.id,
      status: 'open',
      revisionCount: 1,
      hopKind: 'editorial_correction',
    },
    latestSnapshot: null,
    drafts: [],
    publishComment: 'Reason',
  };
  const roots: StructuredPreview['roots'] = [
    {
      logicalId: 'logical-1',
      occurrenceId: 'occurrence-1',
      kind: 'article',
      label: '1',
      content: [
        {
          type: 'text',
          logicalId: 'text-1',
          text: 'First text',
          references: [
            {
              logicalId: 'marker',
              start: 10,
              end: 10,
              target: { type: 'footnote', footnoteId: 'note' },
            },
          ],
        },
      ],
    },
    {
      logicalId: 'logical-2',
      occurrenceId: 'occurrence-2',
      kind: 'article',
      label: '2',
      content: [
        {
          type: 'text',
          logicalId: 'note',
          text: 'Global footnote',
          format: 'footnote',
        },
      ],
    },
  ];
  structured = {
    sessionId: 'session',
    sourceVersionId: original.id,
    sourceGeneration: 1,
    settingsRevisionId: 'settings',
    generation: 2,
    roots,
    sourceRoots: structuredClone(roots),
    operations: [],
  };
  vi.mocked(editor.getDraftPreview).mockImplementation(async () => preview);
  vi.mocked(editor.getStructuredDraft).mockImplementation(
    async () => structured,
  );
  vi.mocked(editor.getEditorDiffReview).mockResolvedValue({
    sourceVersionId: original.id,
    candidates: [],
    decisions: [],
    totals: {},
    currentPosition: null,
  });
});

/** Renders the real route while replacing only independently tested async/client workspace boundaries. */
async function render(params: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await EditorPage({
      searchParams: Promise.resolve({ sessionId: 'session', ...params }),
    }),
  );
}

describe('editor page session contracts', () => {
  it('selected text identity takes precedence over an explicitly selected different article', async () => {
    await render({ articleId: 'old-1', selectedNode: 'note' });
    expect(structuredProps?.rootId).toBe('logical-2');
    expect(structuredProps?.articleId).toBe('old-2');
    expect(api.getUnit).not.toHaveBeenCalled();
    expect(api.getArticle).not.toHaveBeenCalled();
  });
  it('keeps global note indexes while truncating unselected source and draft root bodies', async () => {
    await render({ articleId: 'old-1' });
    expect(
      structuredProps?.preview.roots.map((root) => root.content.length),
    ).toEqual([1, 0]);
    expect(
      structuredProps?.preview.sourceRoots.map((root) => root.content.length),
    ).toEqual([1, 0]);
    expect(
      structuredProps?.preview.footnotes?.map((note) => note.entry.logicalId),
    ).toEqual(['note']);
    expect(
      structuredProps?.preview.footnoteReferences?.map(
        (reference) => reference.noteId,
      ),
    ).toEqual(['note']);
    expect(structured.roots[1].content).toHaveLength(1);
  });
  it('preserves published review links and complete-root wording in the change overview', async () => {
    structured.roots[0].content[0].text = 'Changed wording';
    preview.newVersionId = 'published';
    preview.unitMapping = { 'logical-1': 'published-occurrence' };
    await render();
    expect(structuredProps?.review?.[0]).toMatchObject({
      sourceLink: `/countries/XA/versions/${original.id}#occurrence-1`,
      targetLink: '/countries/XA/versions/published#published-occurrence',
      rootId: 'logical-1',
    });
  });
  it('uses source-evidence workspace before discovery and encodes regional source links', async () => {
    vi.mocked(api.getVersion).mockResolvedValue({
      ...original,
      constitutionId: 'charter',
      publicationStatus: 'published',
      jurisdictionId: 'region/id',
    });
    preview.newVersionId = 'copy/id';
    expect(await render({ scope: 'sources', error: 'invalid' })).toContain(
      'Source workspace',
    );
    expect(sourceProps).toMatchObject({
      sourceHref: `/jurisdictions/region%2Fid/versions/${original.id}`,
      publishedHref: '/jurisdictions/region%2Fid/versions/copy%2Fid',
    });
    expect(api.listCountries).not.toHaveBeenCalled();
  });
  it('automatically opens recorded source revisions unless text scope is requested', async () => {
    preview.sourceEvidenceRevisions = [
      {
        id: 'evidence',
        revision: 3,
        original: null,
        evidence: { datePrecision: 'unknown' },
        reason: 'Reason',
        actorId: 'author',
        createdAt: '2026-01-01',
      },
    ];
    expect(await render()).toContain('Source workspace');
    expect(await render({ scope: 'text' })).toContain('Structured root');
  });
  it('a legacy identity or an existing legacy draft suppresses structured draft loading', async () => {
    vi.mocked(api.listAllUnits).mockResolvedValue([
      { ...article('old-1', '1', 'First'), legacyIdentity: true },
    ]);
    await render();
    expect(editor.getStructuredDraft).not.toHaveBeenCalled();
    expect(api.listAllArticles).toHaveBeenCalled();
    vi.mocked(api.listAllUnits).mockResolvedValue([
      article('old-1', '1', 'First'),
    ]);
    preview.drafts = [
      { articleId: 'old-1', title: 'Saved', body: 'Saved body' },
    ];
    await render();
    expect(editor.getStructuredDraft).not.toHaveBeenCalled();
  });
  it('fetches legal review decisions for active structured sessions but not published sessions', async () => {
    preview.session.hopKind = 'legal';
    await render();
    expect(editor.getEditorDiffReview).toHaveBeenCalledWith('session');
    vi.mocked(editor.getEditorDiffReview).mockClear();
    preview.session.status = 'published';
    await render();
    expect(editor.getEditorDiffReview).not.toHaveBeenCalled();
  });
  it('tolerates optional country-list failure but propagates individual country failures', async () => {
    vi.mocked(api.listCountries).mockRejectedValueOnce(
      new Error('Discovery offline'),
    );
    expect(await render()).toContain('Constitution · 1949');
    vi.mocked(api.getCountry).mockRejectedValueOnce(
      new Error('Country offline'),
    );
    await expect(render()).rejects.toThrow('Country offline');
  });
  it('keeps structure management admin-only and draft saving owner-only', async () => {
    vi.mocked(currentUser).mockResolvedValue({
      id: 'other',
      email: 'other@example.test',
      roles: ['editor'],
    });
    await render();
    expect(structuredProps?.editable).toBe(false);
    expect(structuredProps?.canManageStructure).toBe(false);
    vi.mocked(currentUser).mockResolvedValue({
      id: 'author',
      email: 'author@example.test',
      roles: ['admin'],
    });
    await render();
    expect(structuredProps?.editable).toBe(true);
    expect(structuredProps?.canManageStructure).toBe(true);
  });
});
