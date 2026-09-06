import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_MOCK_PORT ?? 4010);

const countries = JSON.parse(readFileSync(join(root, 'lib/contracts/catalog-countries.json'), 'utf8'));
const germany = JSON.parse(readFileSync(join(root, 'lib/contracts/catalog-country-DE.json'), 'utf8'));
const articles2022 = JSON.parse(readFileSync(join(root, 'lib/contracts/content-articles.json'), 'utf8'));
const article1_2022 = JSON.parse(readFileSync(join(root, 'lib/contracts/content-article.json'), 'utf8'));
const identityMe = JSON.parse(readFileSync(join(root, 'lib/contracts/identity-me.json'), 'utf8'));

const VERSION_1949 = '01900000-0000-4000-8000-000000000003';
const VERSION_2022 = '01900000-0000-4000-8000-000000000004';
const SESSION_ID = '01900000-0000-4000-8000-000000000501';
const SESSION_TOKEN = 'e2e-session-token';
const MFA_CHALLENGE = 'e2e-mfa-challenge';
const MFA_CODE = '123456';
const MFA_EMAILS = new Set([
  'local-editor@example.local',
  'local-admin@example.local',
  'local-publisher@example.local',
]);

const article1_1949 = {
  id: '01900000-0000-4000-8000-000000000101',
  versionId: VERSION_1949,
  articleNumber: '1',
  title: 'Human dignity',
  body: 'Human dignity shall be inviolable.',
  sortOrder: 1,
  kind: 'article',
  children: [
    {
      id: '01900000-0000-4000-8000-000000000121',
      kind: 'paragraph',
      label: '(1)',
      number: null,
      title: null,
      body: null,
      sortOrder: 1,
      children: [
        {
          id: '01900000-0000-4000-8000-000000000122',
          kind: 'sentence',
          label: '1',
          number: null,
          title: null,
          body: 'Human dignity shall be inviolable.',
          sortOrder: 1,
          children: [],
        },
      ],
    },
  ],
};

const articlesById = new Map([
  [article1_2022.id, article1_2022],
  [article1_1949.id, article1_1949],
]);

function articlesFor(versionId, includeBody) {
  const source = versionId === VERSION_1949 ? articles2022.map(to1949) : articles2022;
  return source.map((article) => {
    const detail = articlesById.get(article.id);
    if (!includeBody) {
      return article;
    }
    if (detail) {
      return { ...article, body: detail.body, children: detail.children };
    }
    return { ...article, body: `${article.title}.`, children: [] };
  });
}

function to1949(article) {
  if (article.articleNumber === '1') {
    return {
      id: article1_1949.id,
      versionId: VERSION_1949,
      articleNumber: article1_1949.articleNumber,
      title: article1_1949.title,
      sortOrder: article1_1949.sortOrder,
    };
  }
  return {
    ...article,
    id: article.id.replace('0000000002', '0000000001'),
    versionId: VERSION_1949,
  };
}

const searchFacets = {
  countries: [{ code: 'DE', count: 1 }],
  versions: [
    {
      id: VERSION_2022,
      label: '2022',
      constitutionTitle: 'Basic Law for the Federal Republic of Germany',
      countryCode: 'DE',
      count: 10,
    },
  ],
  dates: [{ effectiveDate: '2022-12-19', count: 10 }],
};

const searchHits = [
  {
    articleId: article1_2022.id,
    versionId: VERSION_2022,
    countryCode: 'DE',
    constitutionTitle: 'Basic Law for the Federal Republic of Germany',
    versionLabel: '2022',
    effectiveDate: '2022-12-19',
    articleNumber: '1',
    title: 'Human dignity',
    snippet: 'Human dignity shall be inviolable.',
    rank: 1,
  },
];

const amendment = {
  id: '01900000-0000-4000-8000-000000000301',
  title: 'Update to Article 1',
  summary: 'Expanded the dignity clause.',
  enactedOn: '2022-12-19',
  sourceReference: 'BGBl. I 2022',
  sourceVersionId: VERSION_1949,
  targetVersionId: VERSION_2022,
  changes: [
    {
      id: '01900000-0000-4000-8000-000000000311',
      articleId: article1_2022.id,
      articleNumber: '1',
      changeType: 'changed',
      note: 'Dignity clause expanded',
      nodeId: article1_2022.children[0].children[0].id,
      changedOn: '2022-12-19',
      effectiveOn: '2022-12-19',
    },
  ],
};

const editorState = {
  session: null,
};

function json(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function empty(res, status) {
  res.writeHead(status);
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function bearer(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function preview() {
  return {
    session: editorState.session,
    latestSnapshot: editorState.session ? 'snapshot' : null,
    drafts: editorState.session?.drafts ?? [],
    publicContentUpdated: editorState.session?.status === 'published' ? true : null,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const { pathname, searchParams } = url;
  const method = req.method ?? 'GET';

  if (pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'GET' && pathname === '/api/catalog/countries') {
    json(res, 200, countries);
    return;
  }
  if (method === 'GET' && pathname === '/api/catalog/countries/DE') {
    json(res, 200, germany);
    return;
  }

  const versionArticles = pathname.match(/^\/api\/content\/versions\/([^/]+)\/articles$/);
  if (method === 'GET' && versionArticles) {
    const items = articlesFor(versionArticles[1], searchParams.get('includeBody') === 'true');
    json(res, 200, items, { 'X-Total-Count': String(items.length) });
    return;
  }
  const articleMatch = pathname.match(/^\/api\/content\/articles\/([^/]+)$/);
  if (method === 'GET' && articleMatch) {
    const article = articlesById.get(articleMatch[1]);
    if (!article) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    json(res, 200, article);
    return;
  }

  const amendmentMatch = pathname.match(/^\/api\/amendment\/versions\/([^/]+)\/amendments$/);
  if (method === 'GET' && amendmentMatch) {
    json(res, 200, [amendment]);
    return;
  }

  if (method === 'GET' && pathname === '/api/search/search/facets') {
    json(res, 200, searchFacets);
    return;
  }
  if (method === 'GET' && pathname === '/api/search/search') {
    const query = (searchParams.get('q') ?? '').toLowerCase();
    json(res, 200, query.includes('dignity') || query.includes('human') ? searchHits : []);
    return;
  }

  if (method === 'POST' && pathname === '/api/identity/login') {
    const body = await readBody(req);
    if (body.password !== 'change-me' || typeof body.email !== 'string') {
      json(res, 401, { error: 'Invalid credentials' });
      return;
    }
    if (MFA_EMAILS.has(body.email)) {
      json(res, 200, {
        user: { ...identityMe, email: body.email },
        mfaRequired: true,
        challengeToken: MFA_CHALLENGE,
      });
      return;
    }
    json(res, 200, {
      token: SESSION_TOKEN,
      expiresInSeconds: 86400,
      user: { ...identityMe, email: body.email, roles: ['viewer'], mfaEnabled: false, mfaRequired: false },
    });
    return;
  }
  if (method === 'POST' && pathname === '/api/identity/login/mfa') {
    const body = await readBody(req);
    if (body.challengeToken !== MFA_CHALLENGE || body.code !== MFA_CODE) {
      json(res, 401, { error: 'Invalid authenticator or recovery code' });
      return;
    }
    json(res, 200, {
      token: SESSION_TOKEN,
      expiresInSeconds: 86400,
      user: identityMe,
    });
    return;
  }
  if (method === 'GET' && pathname === '/api/identity/me') {
    if (bearer(req) !== SESSION_TOKEN) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }
    json(res, 200, identityMe);
    return;
  }
  if (method === 'POST' && pathname === '/api/identity/logout') {
    empty(res, 204);
    return;
  }
  if (method === 'POST' && pathname === '/api/identity/mfa/step-up') {
    const body = await readBody(req);
    if (bearer(req) !== SESSION_TOKEN || body.code !== MFA_CODE) {
      json(res, 401, { error: 'Unable to confirm step-up authentication' });
      return;
    }
    empty(res, 204);
    return;
  }

  if (method === 'POST' && pathname === '/api/editor/edit-sessions') {
    const body = await readBody(req);
    editorState.session = {
      id: SESSION_ID,
      actorId: identityMe.id,
      versionId: body.versionId ?? VERSION_2022,
      status: 'open',
      revisionCount: 0,
      drafts: [],
    };
    json(res, 200, editorState.session);
    return;
  }
  const editorSession = pathname.match(/^\/api\/editor\/edit-sessions\/([^/]+)$/);
  if (method === 'GET' && editorSession) {
    if (!editorState.session || editorState.session.id !== editorSession[1]) {
      json(res, 404, { error: 'Not found' });
      return;
    }
    json(res, 200, preview());
    return;
  }
  const editorCommand = pathname.match(/^\/api\/editor\/edit-sessions\/([^/]+)\/(saves|review|approval|publish)$/);
  if (method === 'POST' && editorCommand && editorState.session?.id === editorCommand[1]) {
    const command = editorCommand[2];
    if (command === 'saves') {
      const body = await readBody(req);
      const drafts = editorState.session.drafts.filter((draft) => draft.articleId !== body.articleId);
      drafts.push({ articleId: body.articleId, title: body.title, body: body.body });
      editorState.session.drafts = drafts;
      editorState.session.revisionCount += 1;
    } else if (command === 'review') {
      editorState.session.status = 'reviewing';
    } else if (command === 'approval') {
      editorState.session.status = 'approved';
    } else if (command === 'publish') {
      editorState.session.status = 'published';
    }
    json(res, 200, preview());
    return;
  }

  if (method === 'POST' && pathname === '/api/ingestion/import-jobs') {
    json(res, 201, {
      id: '01900000-0000-4000-8000-000000000701',
      status: 'completed',
      versionId: VERSION_2022,
      isoCode: 'US',
      errors: [],
    });
    return;
  }
  if (method === 'GET' && pathname.startsWith('/api/ingestion/import-jobs/')) {
    json(res, 200, {
      id: pathname.split('/').pop(),
      status: 'completed',
      versionId: VERSION_2022,
      isoCode: 'US',
      errors: [],
    });
    return;
  }

  json(res, 404, { error: `unhandled ${method} ${pathname}` });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`e2e mock api on http://127.0.0.1:${port}\n`);
});
