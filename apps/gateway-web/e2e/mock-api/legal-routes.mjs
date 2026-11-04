import {
  SESSION_TOKEN,
  bearer,
  identityMe,
  json,
  mockState,
  readBody,
} from "./state.mjs";

/** Match the imprint contact gate before consuming request bytes or mutating state. */
export function handleImprintContact(context) {
  const { pathname } = context;
  if (pathname.startsWith("/api/document/legal-pages/imprint-details"))
    return handleImprintContactResponse(context);
  return false;
}

/** Read public contact first, then enforce credentials and draft revision precedence. */
async function handleImprintContactResponse(context) {
  const { req, res, pathname, method } = context;

  const action = pathname.slice(
    "/api/document/legal-pages/imprint-details".length,
  );
  if (method === "GET" && !action) {
    json(res, 200, mockState.imprintDetailsState.published);
    return true;
  }
  if (bearer(req) !== SESSION_TOKEN) {
    json(res, 401, { error: "Login required" });
    return true;
  }
  if (method === "GET" && action === "/editor") {
    json(res, 200, mockState.imprintDetailsState);
    return true;
  }
  const body = await readBody(req);
  if (
    body.expectedRevision !==
    (mockState.imprintDetailsState.draft?.revision ?? 0)
  ) {
    json(res, 409, { error: "Conflict" });
    return true;
  }
  if (method === "PUT" && action === "/draft") {
    mockState.imprintDetailsState.draft = {
      ...body,
      revision: body.expectedRevision + 1,
    };
    json(res, 200, mockState.imprintDetailsState);
    return true;
  }
  if (method === "POST" && action === "/publish") {
    mockState.imprintDetailsState.published =
      mockState.imprintDetailsState.draft;
    json(res, 200, mockState.imprintDetailsState);
    return true;
  }
  json(res, 404, { error: "Not found" });
  return true;
}

/** Match the legal page gate before consuming request bytes or mutating state. */
export function handleLegalPage(context) {
  const { pathname } = context;
  const legalMatch = pathname.match(
    /^\/api\/document\/legal-pages\/(impressum(?:_en)?|datenschutz(?:_en)?)(?:\/(editor(?:\/revisions)?|draft|publish))?$/,
  );
  if (legalMatch) return handleLegalPageResponse(context, legalMatch);
  return false;
}

/** Retain legal revision, optional contact and publication error ordering. */
function handleLegalPageResponse(context, legalMatch) {
  const { req, res, method } = context;
  const state = mockState.legalPages[legalMatch[1]];
  if (!state) {
    json(res, 404, { error: "Not published" });
    return true;
  }
  const action = legalMatch[2];
  if (method === "GET" && !action) {
    json(
      res,
      state.published ? 200 : 404,
      state.published ?? { error: "Not published" },
    );
    return true;
  }
  if (method === "GET" && action === "editor") {
    json(res, 200, {
      key: state.key,
      draft: state.draft,
      published: state.published,
    });
    return true;
  }
  if (method === "GET" && action === "editor/revisions") {
    json(res, 200, [...state.revisions].reverse());
    return true;
  }
  if (method === "PUT" && action === "draft")
    return saveLegalDraft(context, state, legalMatch[1]);
  if (method === "POST" && action === "publish")
    return publishLegalDraft(context, state);
  return false;
}

/** Validate the text revision before contact revision, then append one shared draft object. */
async function saveLegalDraft({ req, res }, state, key) {
  const body = await readBody(req);
  if (body.expectedRevision !== (state.draft?.revision ?? 0)) {
    json(res, 409, { error: "Conflict" });
    return true;
  }
  if (body.contact) {
    if (
      body.contact.expectedRevision !==
      (mockState.imprintDetailsState.draft?.revision ?? 0)
    ) {
      json(res, 409, { error: "Contact changed" });
      return true;
    }
    mockState.imprintDetailsState.draft = {
      ...body.contact,
      revision: body.contact.expectedRevision + 1,
    };
  }
  const draft = {
    revision: body.expectedRevision + 1,
    content: String(body.content).trim(),
    separateContact: key.startsWith("impressum"),
    createdAt: new Date().toISOString(),
    createdBy: identityMe.id,
  };
  state.draft = draft;
  state.revisions.push(draft);
  json(res, 200, { key: state.key, draft, published: state.published });
  return true;
}

/** Validate the text pin before optional contact publication, preserving shared draft aliases. */
async function publishLegalDraft({ req, res }, state) {
  const body = await readBody(req);
  if (body.expectedRevision !== state.draft?.revision) {
    json(res, 409, { error: "Conflict" });
    return true;
  }
  if (body.expectedContactRevision !== undefined) {
    if (
      body.expectedContactRevision !==
      mockState.imprintDetailsState.draft?.revision
    ) {
      json(res, 409, { error: "Contact changed" });
      return true;
    }
    mockState.imprintDetailsState.published =
      mockState.imprintDetailsState.draft;
  }
  state.published = state.draft;
  json(res, 200, {
    key: state.key,
    draft: state.draft,
    published: state.published,
  });
  return true;
}
