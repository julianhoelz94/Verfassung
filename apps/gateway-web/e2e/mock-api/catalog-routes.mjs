import {
  CONSTITUTION_ID,
  WIKI_IMAGE,
  continuousReaderOutline,
  countries,
  extraVersions,
  germany,
  identityMe,
  json,
  mockState,
  readBody,
  settingsRevisions,
} from "./state.mjs";

/** Retain the early country jurisdiction response before UI-review interception. */
export function handleCountryJurisdiction(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      pathname === `/api/catalog/jurisdictions/${germany.id}`
    )
  )
    return false;
  json(res, 200, {
    jurisdiction: {
      id: germany.id,
      parentId: null,
      name: germany.name,
      slug: "de",
      kind: "country",
      code: "DE",
      historical: false,
    },
    ancestors: [],
    children: [],
    constitutions: germany.constitutions,
  });
  return true;
}

/** Serve the early constitution lifecycle projection before UI-review interception. */
export function handleConstitutionLifecycle(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      pathname ===
        `/api/catalog/constitutions/${CONSTITUTION_ID}/lifecycle-events`
    )
  )
    return false;
  json(
    res,
    200,
    mockState.sprint50Content
      ? [
          {
            id: "01900000-0000-4000-8000-000000000731",
            constitutionId: CONSTITUTION_ID,
            eventType: "adopted",
            eventDate: "1949-05-08",
            dateCertainty: "approximate",
            sourceUrl: "https://example.org/adoption",
            note: "Postwar drafting",
          },
          {
            id: "01900000-0000-4000-8000-000000000732",
            constitutionId: CONSTITUTION_ID,
            eventType: "commenced",
            eventDate: "1949-05-23",
            dateCertainty: "exact",
            sourceUrl: null,
            note: null,
          },
        ]
      : [],
  );
  return true;
}

/** Append national history before the fallback lifecycle response. */
export function handleCountryLifecycle(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === "/api/catalog/countries/DE/constitution-lifecycle"
    )
  )
    return false;
  json(res, 200, [
    ...(mockState.directoryScenario?.nationalEvents ?? []),
    {
      id: "01900000-0000-4000-8000-000000000731",
      constitutionId: CONSTITUTION_ID,
      eventType: "adopted",
      eventDate: "1949-05-08",
      dateCertainty: "approximate",
      sourceUrl: "https://example.org/adoption",
      note: "Postwar drafting",
    },
    {
      id: "01900000-0000-4000-8000-000000000732",
      constitutionId: CONSTITUTION_ID,
      eventType: "commenced",
      eventDate: "1949-05-23",
      dateCertainty: "exact",
      sourceUrl: null,
      note: null,
    },
  ]);
  return true;
}

/** Serve the enabled empty provision lifecycle projection. */
export function handleProvisionLifecycle(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === "/api/catalog/countries/DE/provision-lifecycle"
    )
  )
    return false;
  json(res, 200, []);
  return true;
}

/** Retain the disabled lifecycle fallback after enabled projections. */
export function handleEmptyLifecycle(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      /\/api\/catalog\/countries\/DE\/(constitution|provision)-lifecycle$/.test(
        pathname,
      )
    )
  )
    return false;
  json(res, 200, []);
  return true;
}

/** Serve the pinned country Wiki revision only when historical content is enabled. */
export function handleCountryWiki(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === `/api/catalog/wiki/country/${germany.id}`
    )
  )
    return false;
  json(res, 200, {
    id: "01900000-0000-4000-8000-000000000733",
    targetType: "country",
    targetId: germany.id,
    predecessorId: null,
    summary: "A federal republic",
    body: "# History\n\nHistorical context",
    images: [WIKI_IMAGE],
    sourceUrls: ["https://example.org/country-history"],
    createdAt: "2022-01-01T00:00:00Z",
    createdBy: identityMe.id,
    publishedAt: "2022-01-02T00:00:00Z",
  });
  return true;
}

/** Keep the draft Wiki pin distinct from its published predecessor. */
export function handleCountryWikiDraft(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === `/api/catalog/wiki/country/${germany.id}/draft`
    )
  )
    return false;
  json(res, 200, {
    id: "01900000-0000-4000-8000-000000000735",
    targetType: "country",
    targetId: germany.id,
    predecessorId: "01900000-0000-4000-8000-000000000733",
    summary: "Updated country context",
    body: "# History\n\n- First era\n- Second era",
    images: [WIKI_IMAGE],
    sourceUrls: ["https://example.org/country-history"],
    createdAt: "2022-02-01T00:00:00Z",
    createdBy: identityMe.id,
    publishedAt: null,
  });
  return true;
}

/** Retain newest-first country Wiki history and exact source fields. */
export function handleCountryWikiHistory(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === `/api/catalog/wiki/country/${germany.id}/history`
    )
  )
    return false;
  json(res, 200, [
    {
      id: "01900000-0000-4000-8000-000000000735",
      targetType: "country",
      targetId: germany.id,
      predecessorId: "01900000-0000-4000-8000-000000000733",
      summary: "Updated country context",
      body: "# History\n\n- First era\n- Second era",
      images: [WIKI_IMAGE],
      sourceUrls: ["https://example.org/country-history"],
      createdAt: "2022-02-01T00:00:00Z",
      createdBy: identityMe.id,
      publishedAt: null,
    },
    {
      id: "01900000-0000-4000-8000-000000000733",
      targetType: "country",
      targetId: germany.id,
      predecessorId: null,
      summary: "A federal republic",
      body: "# History\n\nHistorical context",
      images: [WIKI_IMAGE],
      sourceUrls: ["https://example.org/country-history"],
      createdAt: "2022-01-01T00:00:00Z",
      createdBy: identityMe.id,
      publishedAt: "2022-01-02T00:00:00Z",
    },
  ]);
  return true;
}

/** Serve the enabled constitution context without changing its source references. */
export function handleConstitutionWiki(context) {
  const { pathname, method, res } = context;
  if (
    !(
      mockState.sprint50Content &&
      method === "GET" &&
      pathname === `/api/catalog/wiki/constitution/${CONSTITUTION_ID}`
    )
  )
    return false;
  json(res, 200, {
    id: "01900000-0000-4000-8000-000000000734",
    targetType: "constitution",
    targetId: CONSTITUTION_ID,
    predecessorId: null,
    summary: "The Basic Law",
    body: "Constitutional context",
    images: [],
    sourceUrls: ["https://example.org/basic-law"],
  });
  return true;
}

/** Serve the immutable country contract fixture. */
export function handleCountries(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/catalog/countries"))
    return false;
  json(res, 200, countries);
  return true;
}

/** Combine base, correction and newly created constitutions in their original order. */
export function handleCountry(context) {
  const { pathname, method, res } = context;
  if (!(method === "GET" && pathname === "/api/catalog/countries/DE"))
    return false;
  const baseConstitutions = (
    mockState.uiReview?.country ?? germany
  ).constitutions.map((item) =>
    item.id === CONSTITUTION_ID
      ? { ...item, versions: [...item.versions, ...extraVersions] }
      : item,
  );
  json(res, 200, {
    ...germany,
    constitutions: [...baseConstitutions, ...mockState.createdConstitutions],
  });
  return true;
}

/** Match the create constitution gate before consuming request bytes or mutating state. */
export function handleCreateConstitution(context) {
  const { pathname, method } = context;
  if (
    method === "POST" &&
    pathname === "/api/catalog/countries/DE/constitutions"
  )
    return handleCreateConstitutionResponse(context);
  return false;
}

/** Append the deterministic created constitution with the submitted outline. */
async function handleCreateConstitutionResponse(context) {
  const { req, res } = context;

  const body = await readBody(req);
  const created = {
    id: "01900000-0000-4000-8000-000000000099",
    slug: body.slug,
    title: body.title,
    latestVersionId: null,
    versions: [],
    contentOutline: { kinds: body.outline },
  };
  mockState.createdConstitutions.push(created);
  json(res, 201, created);
  return true;
}

/** Match the settings gate before consuming request bytes or mutating state. */
export function handleSettings(context) {
  const { pathname } = context;
  const settingsMatch = pathname.match(
    /^\/api\/catalog\/constitutions\/([^/]+)\/settings(\/preflight)?$/,
  );
  if (settingsMatch) return handleSettingsResponse(context, settingsMatch);
  return false;
}

/** Resolve constitution, initialize its pin, then preserve read/preflight/write precedence. */
async function handleSettingsResponse(context, settingsMatch) {
  const { req, res, method } = context;

  const constitution = [
    ...mockState.createdConstitutions,
    ...germany.constitutions,
  ].find((item) => item.id === settingsMatch[1]);
  if (!constitution) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  let current = settingsRevisions.get(constitution.id);
  if (!current) {
    current = {
      id: "01900000-0000-4000-8000-000000000901",
      predecessorId: null,
      outline: constitution.contentOutline,
    };
    settingsRevisions.set(constitution.id, current);
  }
  if (method === "GET") {
    json(res, 200, current);
    return true;
  }
  const body = await readBody(req);
  if (settingsMatch[2]) {
    json(res, 200, {
      currentRevisionId: current.id,
      classification: "safely_reversible",
      affectedVersionIds: (constitution.versions ?? []).map(
        (version) => version.id,
      ),
      affectedDraftSessionIds: [],
      violations: [],
      reasons: [],
    });
    return true;
  }
  if (body.expectedRevisionId !== current.id) {
    json(res, 409, { error: "stale_settings" });
    return true;
  }
  const next = {
    id: "01900000-0000-4000-8000-000000000902",
    predecessorId: current.id,
    outline: { kinds: body.kinds },
  };
  constitution.contentOutline = next.outline;
  settingsRevisions.set(constitution.id, next);
  json(res, 200, next);
  return true;
}

/** Select continuous reader settings before the default country outline. */
export function handleReaderSettings(context) {
  const { pathname, method, res } = context;
  if (
    !(
      method === "GET" &&
      /^\/api\/catalog\/versions\/[^/]+\/reader-settings$/.test(pathname)
    )
  )
    return false;
  json(
    res,
    200,
    mockState.continuousReader
      ? continuousReaderOutline
      : germany.constitutions[0].contentOutline,
  );
  return true;
}

/** Match the write outline gate before consuming request bytes or mutating state. */
export function handleWriteOutline(context) {
  const { method, pathname } = context;
  const outlineMatch = pathname.match(
    /^\/api\/catalog\/constitutions\/([^/]+)\/content-outline$/,
  );
  if (method === "PUT" && outlineMatch)
    return handleWriteOutlineResponse(context, outlineMatch);
  return false;
}

/** Update only created constitutions while retaining the successful empty-version response. */
async function handleWriteOutlineResponse(context, outlineMatch) {
  const { req, res } = context;

  const body = await readBody(req);
  const created = mockState.createdConstitutions.find(
    (item) => item.id === outlineMatch[1],
  );
  if (created) created.contentOutline = { kinds: body.kinds };
  json(res, 200, { versionIds: [] });
  return true;
}

/** Retain staff listing filtering and correction version ordering. */
export function handleConstitutionVersions(context) {
  const { method, pathname, res, searchParams } = context;
  const constitutionVersionsMatch = pathname.match(
    /^\/api\/catalog\/constitutions\/([^/]+)\/versions$/,
  );
  if (!(method === "GET" && constitutionVersionsMatch)) return false;
  const constitution = germany.constitutions.find(
    (item) => item.id === constitutionVersionsMatch[1],
  );
  const versions = [
    ...(mockState.uiReview?.country.constitutions[0].versions ??
      constitution?.versions ??
      []),
    ...extraVersions,
  ];
  const listing = searchParams.get("listing");
  const filtered =
    listing === "all"
      ? versions
      : versions.filter(
          (version) =>
            version.listing !== "staff" &&
            version.hopKind !== "editorial_correction",
        );
  json(res, 200, filtered);
  return true;
}

/** Return the pinned legal/editorial identity or the original missing-version error. */
export function handleVersion(context) {
  const { method, pathname, res } = context;
  const versionDetail = pathname.match(/^\/api\/catalog\/versions\/([^/]+)$/);
  if (!(method === "GET" && versionDetail)) return false;
  const version = [...germany.constitutions[0].versions, ...extraVersions].find(
    (item) => item.id === versionDetail[1],
  );
  if (!version) {
    json(res, 404, { error: "Not found" });
    return true;
  }
  json(res, 200, {
    ...version,
    jurisdictionId: germany.id,
    constitutionId: CONSTITUTION_ID,
    countryCode: "DE",
    publicationStatus: "published",
    legalVersionId:
      version.legalVersionId ??
      (version.hopKind === "editorial_correction"
        ? version.predecessorVersionId
        : version.id),
  });
  return true;
}
