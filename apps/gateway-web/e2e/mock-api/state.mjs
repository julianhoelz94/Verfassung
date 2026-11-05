import QRCode from "qrcode";
import { countryDirectoryFixtures } from "../fixtures/country-directory.mjs";
import {
  continuousReaderOutline,
  continuousReaderUnits,
} from "../fixtures/continuous-reader.mjs";
import {
  reviewFixtures,
  testTotp,
  MFA_TEST_SECRET,
} from "../fixtures/ui-review.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const port = Number(process.env.E2E_MOCK_PORT ?? 4010);

const countries = JSON.parse(
  readFileSync(join(root, "lib/contracts/catalog-countries.json"), "utf8"),
);

const germany = JSON.parse(
  readFileSync(join(root, "lib/contracts/catalog-country-DE.json"), "utf8"),
);

const articles2022 = JSON.parse(
  readFileSync(join(root, "lib/contracts/content-articles.json"), "utf8"),
);

const article1_2022 = JSON.parse(
  readFileSync(join(root, "lib/contracts/content-article.json"), "utf8"),
);

const identityMe = JSON.parse(
  readFileSync(join(root, "lib/contracts/identity-me.json"), "utf8"),
);

const searchFacets = JSON.parse(
  readFileSync(join(root, "lib/contracts/search-facets.json"), "utf8"),
);

const searchPage = JSON.parse(
  readFileSync(join(root, "lib/contracts/search-page.json"), "utf8"),
);

const VERSION_1949 = "01900000-0000-4000-8000-000000000003";

const VERSION_2022 = "01900000-0000-4000-8000-000000000004";

const SESSION_ID = "01900000-0000-4000-8000-000000000501";

const SESSION_TOKEN = "e2e-session-token";

const MFA_CHALLENGE = "e2e-mfa-challenge";

const MFA_CODE = "123456";

const MFA_EMAILS = new Set([
  "local-editor@example.local",
  "local-admin@example.local",
  "local-publisher@example.local",
]);

const article1_1949 = {
  id: "01900000-0000-4000-8000-000000000101",
  versionId: VERSION_1949,
  articleNumber: "1",
  title: "Human dignity",
  body: "Human dignity shall be inviolable.",
  sortOrder: 1,
  kind: "article",
  children: [
    {
      id: "01900000-0000-4000-8000-000000000121",
      kind: "paragraph",
      label: "(1)",
      number: null,
      title: null,
      body: null,
      sortOrder: 1,
      children: [
        {
          id: "01900000-0000-4000-8000-000000000122",
          kind: "sentence",
          label: "1",
          number: null,
          title: null,
          body: "Human dignity shall be inviolable.",
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

/** Select historical summaries, then add legacy body/children only when requested. */
function articlesFor(versionId, includeBody) {
  const source = (
    versionId === VERSION_1949 ? articles2022.map(to1949) : articles2022
  ).map((article) => ({ ...article, versionId }));
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

/** Build deterministic ordered identities and revision hashes from current title overrides. */
function mockUnit(article) {
  /** Hash authored identity input into the original deterministic UUID spelling. */
  function uuid(value) {
    const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  /** Preserve child order, leaf text and title-override precedence in revision fingerprints. */
  function node(source, identity) {
    const children = source.children ?? [];
    const content = children.length
      ? children.map((child, index) => ({
          type: "child",
          node: node(
            child,
            `${identity}/${child.kind}/${child.label ?? child.number ?? index}`,
          ),
        }))
      : [
          {
            type: "text",
            logicalId: uuid(`${identity}:text`),
            revisionId: uuid(`text:${source.body ?? ""}`),
            occurrenceId: uuid(`${article.versionId}:${identity}:text`),
            text: source.body ?? "",
          },
        ];
    const title = mockState.nodeTitleOverrides.get(source.id) ?? source.title;
    return {
      logicalId: uuid(identity),
      revisionId: uuid(
        JSON.stringify([
          source.kind ?? "article",
          source.label ?? source.articleNumber,
          title,
          content.map((entry) => entry.node?.revisionId ?? entry.revisionId),
        ]),
      ),
      occurrenceId: source.id,
      kind: source.kind ?? "article",
      label: source.label ?? source.number ?? source.articleNumber ?? null,
      title: title ?? null,
      content,
    };
  }
  const ordered = node(article, `article:${article.articleNumber}`);
  return {
    ...article,
    kind: ordered.kind,
    logicalId: ordered.logicalId,
    revisionId: ordered.revisionId,
    content: ordered.content,
  };
}

/** Retain the first historical article identity and the original fallback ID substitution. */
function to1949(article) {
  if (article.articleNumber === "1") {
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
    id: article.id.replace("0000000002", "0000000001"),
    versionId: VERSION_1949,
  };
}

const CONSTITUTION_ID = "01900000-0000-4000-8000-000000000002";

const amendment = {
  id: "01900000-0000-4000-8000-000000000301",
  title: "Update to Article 1",
  summary: "Expanded the dignity clause.",
  comment: "The published legal-change comment.",
  documents: [
    {
      url: "https://example.gov/update-article-1.pdf",
      label: "Official change document",
    },
  ],
  enactedOn: "2022-12-19",
  sourceReference: "BGBl. I 2022",
  constitutionId: CONSTITUTION_ID,
  kind: "legal_amendment",
  status: "published",
  reviewStatus: "ok",
  publishedRevisionId: "01900000-0000-4000-8000-000000000321",
  sourceVersionId: VERSION_1949,
  targetVersionId: VERSION_2022,
  changes: [
    {
      id: "01900000-0000-4000-8000-000000000311",
      articleId: article1_2022.id,
      articleNumber: "1",
      changeType: "changed",
      note: "Dignity clause expanded",
      nodeId: article1_2022.children[0].children[0].id,
      changedOn: "2022-12-19",
      effectiveOn: "2022-12-19",
    },
  ],
};

const amendmentDraft = {
  ...amendment,
  id: "01900000-0000-4000-8000-000000000302",
  title: "Draft amending law",
  status: "draft",
  reviewStatus: "ok",
  publishedRevisionId: null,
};

const amendmentRevision = {
  id: "01900000-0000-4000-8000-000000000321",
  predecessorRevisionId: null,
  createdBy: identityMe.id,
  createdAt: "2022-12-19T12:00:00Z",
  title: amendment.title,
  summary: amendment.summary,
  enactedOn: amendment.enactedOn,
  effectiveOn: null,
  sourceReference: amendment.sourceReference,
  sourceVersionId: amendment.sourceVersionId,
  targetVersionId: amendment.targetVersionId,
  comment: amendment.comment,
  kind: amendment.kind,
  changes: amendment.changes.map(({ articleNumber, changeType, note }) => ({
    articleNumber,
    changeType,
    note,
  })),
};

const mockAmendments = new Map([
  [amendment.id, amendment],
  [amendmentDraft.id, amendmentDraft],
]);

const extraVersions = [];

const EDITORIAL_VERSION_ID = "01900000-0000-4000-8000-000000000501";

const editorState = {
  session: null,
  seededSessions: [],
  sessionsUnavailable: false,
};

/** Mutable replacements remain request-visible after every reset, login and write. */
export const mockState = {
  editorDocumentScenario: undefined,
  pendingMfaEmail: identityMe.email,
  currentUser: { ...identityMe },
  importJobs: new Map(),
  importPublicationError: null,
  managedUsers: [],
  serviceTokens: [],
  credentials: new Map(),
  createdConstitutions: [],
  nodeTitleOverrides: new Map(),
  enrolledMfaEmails: new Set(),
  recoveryCodes: new Map(),
  uiReview: undefined,
  forceEnrollment: false,
  stepUpFresh: true,
  visualRoles: false,
  sprint50Content: false,
  directoryScenario: undefined,
  directoryUnavailable: [],
  denseUi: false,
  continuousReader: false,
  authoredFootnoteWords: false,
  historyUnavailable: { lifecycle: false, amendments: false },
  legalPages: {},
  imprintDetailsState: undefined,
  translationSite: {
    provider: "google",
    sharedKeyConfigured: true,
    sharedGoogleCharactersUsed: 0,
    sharedGoogleCharacterLimit: 500000,
  },
  translationUser: {
    alwaysTranslate: false,
    personalGoogleKeyConfigured: false,
  },
  swaggerAccess: { enabled: true },
  anonymousBrowsing: {
    allowed: true,
    perIp: { requests: 600, windowValue: 1, windowUnit: "minutes" },
    total: { requests: 6000, windowValue: 1, windowUnit: "minutes" },
    revision: 0,
  },
};

const settingsRevisions = new Map();

const WIKI_IMAGE_ID = "01900000-0000-4000-8000-000000000736";

const WIKI_IMAGE = {
  documentId: WIKI_IMAGE_ID,
  revision: 2,
  alt: "A historic flag",
  caption: "Historic flag",
  credit: "Archive",
  sourceUrl: "https://example.org/flag",
  rights: "Public domain",
  placement: "before_body",
};

/** Replace request-visible collections and flags while retaining fixture, version and editor aliases. */
function resetMockState() {
  mockState.editorDocumentScenario = undefined;
  mockState.directoryScenario = undefined;
  mockState.directoryUnavailable = [];
  mockState.continuousReader = false;
  mockState.authoredFootnoteWords = false;
  mockAmendments.clear();
  mockAmendments.set(amendment.id, amendment);
  mockAmendments.set(amendmentDraft.id, amendmentDraft);
  extraVersions.splice(0);
  editorState.session = null;
  editorState.seededSessions = [];
  editorState.sessionsUnavailable = false;
  mockState.pendingMfaEmail = identityMe.email;
  mockState.currentUser = { ...identityMe };
  mockState.importJobs = new Map();
  mockState.importPublicationError = null;
  mockState.managedUsers = [];
  mockState.serviceTokens = [];
  mockState.createdConstitutions = [];
  settingsRevisions.clear();
  mockState.nodeTitleOverrides = new Map();
  mockState.enrolledMfaEmails = new Set();
  mockState.recoveryCodes = new Map();
  mockState.uiReview = undefined;
  mockState.forceEnrollment = false;
  mockState.stepUpFresh = true;
  mockState.visualRoles = false;
  mockState.sprint50Content = false;
  mockState.denseUi = false;
  mockState.historyUnavailable = { lifecycle: false, amendments: false };
  mockState.translationSite = {
    provider: "google",
    sharedKeyConfigured: true,
    sharedGoogleCharactersUsed: 0,
    sharedGoogleCharacterLimit: 500000,
  };
  mockState.translationUser = {
    alwaysTranslate: false,
    personalGoogleKeyConfigured: false,
  };
  mockState.swaggerAccess = { enabled: true };
  mockState.anonymousBrowsing = {
    allowed: true,
    perIp: { requests: 600, windowValue: 1, windowUnit: "minutes" },
    total: { requests: 6000, windowValue: 1, windowUnit: "minutes" },
    revision: 0,
  };
  const impressum = {
    revision: 1,
    content: "Example publisher information",
    separateContact: true,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: identityMe.id,
  };
  const impressumEn = {
    revision: 1,
    content: "English publisher information",
    separateContact: true,
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: identityMe.id,
  };
  const datenschutz = {
    revision: 1,
    content: "Example privacy notice for browser tests.",
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: identityMe.id,
  };
  mockState.legalPages = {
    impressum: {
      key: "impressum",
      draft: impressum,
      published: impressum,
      revisions: [impressum],
    },
    impressum_en: {
      key: "impressum_en",
      draft: impressumEn,
      published: impressumEn,
      revisions: [impressumEn],
    },
    datenschutz: {
      key: "datenschutz",
      draft: datenschutz,
      published: datenschutz,
      revisions: [datenschutz],
    },
  };
  const contact = {
    revision: 1,
    name: "Atlas Foundation",
    streetAddress: "Main Street 1",
    postalCode: "10000",
    city: "Berlin",
    country: "Germany",
    email: "contact@atlas.example",
  };
  mockState.imprintDetailsState = { draft: contact, published: contact };
  mockState.credentials = new Map([
    ["local-editor@example.local", "change-me"],
    ["local-reviewer@example.local", "change-me"],
    ["local-publisher@example.local", "change-me"],
    ["local-admin@example.local", "change-me"],
    ["local-viewer@example.local", "change-me"],
  ]);
}

/** Project roles and MFA flags from the selected account and current scenario state. */
function userForEmail(email) {
  if (email === "local-editor@example.local") {
    return {
      ...identityMe,
      email,
      roles: mockState.visualRoles ? identityMe.roles : ["editor"],
    };
  }
  if (email === "local-admin@example.local") {
    return { ...identityMe, email, roles: ["admin"] };
  }
  if (email === "local-publisher@example.local") {
    return { ...identityMe, email, roles: ["publisher"] };
  }
  if (email === "local-reviewer@example.local") {
    return {
      ...identityMe,
      email,
      roles: ["reviewer"],
      mfaEnabled: false,
      mfaRequired: false,
    };
  }
  if (email === "local-viewer@example.local") {
    return {
      ...identityMe,
      email,
      roles: ["viewer"],
      mfaEnabled: mockState.enrolledMfaEmails.has(email),
      mfaRequired: false,
    };
  }
  if (email === "invited@example.local") {
    return {
      ...identityMe,
      email,
      roles: ["viewer"],
      mfaEnabled: false,
      mfaRequired: false,
    };
  }
  return { ...identityMe, email };
}

/** Serialize once and retain exact JSON media type, byte length and caller header precedence. */
function json(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

/** End no-content responses without introducing JSON headers or a response body. */
function empty(res, status) {
  res.writeHead(status);
  res.end();
}

/** Consume the selected request stream once; empty or malformed JSON remains an empty object. */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
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

/** Recognize only the original case-sensitive Bearer prefix and otherwise return an empty token. */
function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/** Project active session publication fields without copying or advancing session state. */
function preview() {
  return {
    session: editorState.session,
    latestSnapshot: editorState.session ? "snapshot" : null,
    drafts: editorState.session?.drafts ?? [],
    publishComment: editorState.session?.publishComment ?? null,
    changeRecord: editorState.session?.changeRecord ?? null,
    amendmentStatus:
      editorState.session?.status === "published" ? "ready" : null,
    searchIndexStatus:
      editorState.session?.status === "published" ? "ready" : null,
    publicContentUpdated:
      editorState.session?.status === "published" ? true : null,
    newVersionId:
      editorState.session?.status === "published"
        ? (editorState.session.newVersionId ??
          "01900000-0000-4000-8000-000000000501")
        : null,
    newVersionLabel:
      editorState.session?.status === "published"
        ? (editorState.session.newVersionLabel ?? "2022-1")
        : null,
  };
}

/** Send a JSON response and signal that the ordered dispatcher must stop. */
export function handledJson(...args) {
  json(...args);
  return true;
}

export {
  QRCode,
  countryDirectoryFixtures,
  continuousReaderOutline,
  continuousReaderUnits,
  reviewFixtures,
  testTotp,
  MFA_TEST_SECRET,
  port,
  countries,
  germany,
  articles2022,
  identityMe,
  searchFacets,
  searchPage,
  VERSION_1949,
  VERSION_2022,
  SESSION_ID,
  SESSION_TOKEN,
  MFA_CHALLENGE,
  MFA_CODE,
  MFA_EMAILS,
  articlesById,
  articlesFor,
  mockUnit,
  CONSTITUTION_ID,
  amendment,
  amendmentDraft,
  amendmentRevision,
  mockAmendments,
  extraVersions,
  EDITORIAL_VERSION_ID,
  editorState,
  settingsRevisions,
  WIKI_IMAGE_ID,
  WIKI_IMAGE,
  resetMockState,
  userForEmail,
  json,
  empty,
  readBody,
  bearer,
  preview,
};
