import {
  WIKI_IMAGE_ID,
  articles2022,
  articlesById,
  articlesFor,
  continuousReaderUnits,
  json,
  mockState,
  mockUnit,
  readBody,
} from "./state.mjs";

/** Retain binary image bytes, media type and length before generic document reads. */
export function handleWikiImage(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === `/api/document/documents/${WIKI_IMAGE_ID}/revisions/2/file`
    )
  )
    return false;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GZkAAAAASUVORK5CYII=",
    "base64",
  );
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": bytes.length,
  });
  res.end(bytes);
  return true;
}

/** Keep the empty document/link/event fallback method and path scope. */
export function handleEmptyDocuments(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      (pathname === "/api/document/documents" ||
        /^\/api\/document\/links\/(constitution|version|amendment)\/[^/]+(?:\/events)?$/.test(
          pathname,
        ))
    )
  )
    return false;
  json(res, 200, []);
  return true;
}

/** Serve ordered export roots only while UI-review content is enabled. */
export function handleExportContent(context) {
  const { method, pathname, res } = context;
  const exported = pathname.match(
    /^\/api\/content\/versions\/([^/]+)\/export$/,
  );
  if (!(mockState.uiReview && method === "GET" && exported)) return false;
  json(res, 200, {
    roots: articlesFor(exported[1], true)
      .map(mockUnit)
      .map((unit) => ({ ...unit, label: unit.articleNumber })),
  });
  return true;
}

/** Preserve reader wording, reference offsets, single-unit lookup and list count headers. */
export function handleUnits(context) {
  const { method, pathname, res } = context;
  const units = pathname.match(
    /^\/api\/content\/versions\/([^/]+)\/units(?:\/([^/]+))?$/,
  );
  if (!(method === "GET" && units)) return false;
  const items = mockState.continuousReader
    ? continuousReaderUnits(units[1])
    : articlesFor(units[1], true).map(mockUnit);
  if (mockState.continuousReader && mockState.authoredFootnoteWords) {
    const entry = items[0].content[0].node.content[1].node.content[0];
    entry.text = "Die Freyheit jedes Bürgers ist unverletzlich.";
    entry.references[0].start = 4;
    entry.references[0].end = 12;
  }
  if (units[2]) {
    const item = items.find((unit) => unit.id === units[2]);
    json(res, item ? 200 : 404, item ?? { error: "Not found" });
  } else json(res, 200, items, { "X-Total-Count": String(items.length) });
  return true;
}

/** Retain body selection and total count for version-scoped article summaries. */
export function handleArticles(context) {
  const { method, pathname, res, searchParams } = context;
  const versionArticles = pathname.match(
    /^\/api\/content\/versions\/([^/]+)\/articles$/,
  );
  if (!(method === "GET" && versionArticles)) return false;
  const items = articlesFor(
    versionArticles[1],
    searchParams.get("includeBody") === "true",
  );
  json(res, 200, items, { "X-Total-Count": String(items.length) });
  return true;
}

/** Apply title overrides recursively without mutating the shared article fixture. */
export function handleArticle(context) {
  const { method, pathname, res } = context;
  const articleMatch = pathname.match(/^\/api\/content\/articles\/([^/]+)$/);
  if (!(method === "GET" && articleMatch)) return false;
  const summary = articles2022.find((item) => item.id === articleMatch[1]);
  const article =
    articlesById.get(articleMatch[1]) ??
    (summary ? { ...summary, body: `${summary.title}.`, children: [] } : null);
  if (!article) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  const applyTitles = (node) => ({
    ...node,
    title: mockState.nodeTitleOverrides.has(node.id)
      ? mockState.nodeTitleOverrides.get(node.id)
      : node.title,
    children: (node.children ?? []).map(applyTitles),
  });
  json(res, 200, applyTitles(article));
  return true;
}

/** Match the write node title gate before consuming request bytes or mutating state. */
export function handleWriteNodeTitle(context) {
  const { method, pathname } = context;
  const contentNodeMatch = pathname.match(/^\/api\/content\/nodes\/([^/]+)$/);
  if (method === "PATCH" && contentNodeMatch)
    return handleWriteNodeTitleResponse(context, contentNodeMatch);
  return false;
}

/** Store title overrides for later legacy and ordered projections. */
async function handleWriteNodeTitleResponse(context, contentNodeMatch) {
  const { req, res } = context;

  const body = await readBody(req);
  mockState.nodeTitleOverrides.set(contentNodeMatch[1], body.title);
  json(res, 200, { id: contentNodeMatch[1], title: body.title, children: [] });
  return true;
}
