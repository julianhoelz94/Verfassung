import { McpServer } from '@modelcontextprotocol/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deleteJson, getJson, postJson, putJson, publicVersionUrl, requirePublishedVersion, UpstreamError } from './catalog.js';
import { CursorError, decodeCursor, encodeCursor, fingerprint } from './cursor.js';
import { importPayloadSchema, setupProposalSchema } from './import-schema.js';

const uuid = z.string().uuid();
const page = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(1024).optional() };
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const stagedWrite = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const newStagedWrite = { ...stagedWrite, idempotentHint: false };
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });

type Country = { isoCode: string; name: string; versionCount: number };
type CountryDetail = { isoCode: string; name: string; constitutions: Array<{ id: string; slug: string; title: string; versions: unknown[] }> };
type OrderedEntry = { type: string; text?: string | null; node?: { logicalId?: string; content?: OrderedEntry[] } | null };
type Unit = { id: string; versionId: string; articleNumber: string; title: string; body?: string; kind?: string; children?: Array<{ id: string }>; content?: OrderedEntry[] };

const settingsGuidance = [
  { id: 'country.isoCode', field: 'isoCode', description: 'Two-letter country code used in public links.', allowed: 'Two letters', changeability: 'set_once' },
  { id: 'country.name', field: 'countryName', description: 'Public name shown on the country page and in selectors.', allowed: 'Non-empty text', changeability: 'set_once' },
  { id: 'constitution.predecessor', field: 'predecessorConstitutionId', description: 'Earlier constitution replaced by this one; used in the timeline.', allowed: 'Existing constitution UUID in this country, or null', changeability: 'set_once' },
  { id: 'constitution.interim', field: 'interim', description: 'Marks a transitional constitution; legal status and end date are separate lifecycle events.', allowed: [true, false], changeability: 'set_once' },
  { id: 'constitution.title', field: 'constitutionTitle', description: 'Public name shown on country pages and timelines.', allowed: 'Non-empty text', changeability: 'later' },
  { id: 'constitution.slug', field: 'constitutionSlug', description: 'Readable catalog identifier; an old slug remains an alias after change.', allowed: 'Lowercase letters, digits and hyphens', changeability: 'later' },
  { id: 'outline.kindCode', field: 'outline.kinds[].kindCode', description: 'Stable internal identifier of a structural level.', allowed: 'Unique lowercase code up to 32 characters', changeability: 'set_once' },
  { id: 'outline.displayLabel', field: 'outline.kinds[].displayLabel', description: 'Reader-facing name of a structural level.', allowed: 'Non-empty text', changeability: 'impact_review' },
  { id: 'outline.allowTextAlongsideChildren', field: 'outline.kinds[].allowTextAlongsideChildren', description: 'Allows unnumbered parent text before, between or after child units.', allowed: [true, false], changeability: 'impact_review' },
  { id: 'outline.titlePolicy', field: 'outline.kinds[].titlePolicy', description: 'Whether units may or must have an editorial title.', allowed: ['none', 'optional', 'required'], changeability: 'impact_review' },
  { id: 'outline.labelPolicy', field: 'outline.kinds[].labelPolicy', description: 'Whether exact source labels such as 46a or (2a) may or must be entered.', allowed: ['none', 'optional', 'required'], changeability: 'impact_review' },
  { id: 'outline.segmentation', field: 'outline.kinds[].segmentation', description: 'Plain editing or guided sentence boundaries on the final text level.', allowed: ['plain', 'sentence'], changeability: 'impact_review' },
  { id: 'outline.presentation', field: 'outline.kinds[].presentation', description: 'Separate block or running text in the public reader.', allowed: ['section', 'concatenated'], changeability: 'impact_review' },
  { id: 'outline.showKind', field: 'outline.kinds[].showKind', description: 'Displays the kind name before each unit.', allowed: [true, false], changeability: 'impact_review' },
  { id: 'outline.showLabel', field: 'outline.kinds[].showLabel', description: 'Displays the exact source label beside each unit.', allowed: [true, false], changeability: 'impact_review' },
  { id: 'outline.showTitle', field: 'outline.kinds[].showTitle', description: 'Displays editorial titles when titles are allowed.', allowed: [true, false], changeability: 'impact_review' },
  { id: 'outline.labelPlacement', field: 'outline.kinds[].labelPlacement', description: 'Places labels before or after a title, inline, or as superscript.', allowed: ['before_title', 'after_title', 'inline', 'superscript'], changeability: 'impact_review' },
] as const;

export function orderedText(entries: OrderedEntry[]): string {
  let text = '';
  let previousChild = false;
  for (const entry of entries) {
    const child = entry.type === 'child';
    const part = child ? orderedText(entry.node?.content ?? []) : entry.text ?? '';
    if (!part) continue;
    if (text && (child || previousChild) && !/\s$/.test(text) && /^[\p{L}\p{N}]/u.test(part)) text += ' ';
    text += part;
    previousChild = child;
  }
  return text;
}

async function runLogged<T extends Record<string, unknown>>(tool: string, action: () => Promise<T>, actorId: () => string | undefined) {
  const started = Date.now();
  try {
    const value = await action();
    const resourceId = value.jobId ?? value.itemId ?? value.batchId ?? value.proposalId ?? value.constitutionId ?? value.uploadId;
    console.info(JSON.stringify({ event: 'mcp_tool', tool, actorId: actorId(), resourceId, outcome: 'ok', elapsedMs: Date.now() - started }));
    return json(value);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'mcp_tool', tool, actorId: actorId(), outcome: 'error', status: error instanceof UpstreamError ? error.status : error instanceof CursorError ? 400 : 503, elapsedMs: Date.now() - started }));
    const message = error instanceof UpstreamError || error instanceof CursorError ? error.message : 'The requested data could not be loaded.';
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  }
}

export function createServer(authorization?: string): McpServer {
  const server = new McpServer(
    { name: 'constitution-atlas', version: '0.1.0' },
    { capabilities: { tools: {} }, cacheHints: { 'tools/list': { ttlMs: 60_000, cacheScope: 'private' }, 'server/discover': { ttlMs: 60_000, cacheScope: 'private' } } },
  );
  let auditActorId: string | undefined;
  const run = <T extends Record<string, unknown>>(tool: string, action: () => Promise<T>) => runLogged(tool, action, () => auditActorId);

  async function requireImportKey() {
    if (!authorization?.startsWith('Bearer ca_mcp_')) throw new UpstreamError(403, 'identity');
    const actor = await getJson<{ id?: string; scopes: string[] }>('identity', '/me', authorization);
    if (!actor.scopes.includes('ingestion:import')) throw new UpstreamError(403, 'identity');
    auditActorId = actor.id;
  }

  function requireConfirmedUpload(payload: Record<string, unknown>) {
    if (!uuid.safeParse(payload.constitutionId).success || !uuid.safeParse(payload.settingsRevisionId).success || payload.outline != null) {
      throw new UpstreamError(409, 'ingestion', 'Full upload requires the confirmed constitutionId and settingsRevisionId; omit outline.');
    }
  }

  function requireDirectUploadSize(payload: Record<string, unknown>) {
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 2_097_152) {
      throw new UpstreamError(413, 'mcp', 'Direct upload exceeds 2 MiB; use a chunked batch upload.');
    }
  }

  server.registerTool('get_import_schema', {
    description: 'Learn the structured constitution import format, hierarchy rules, and review workflow before staging content.',
    inputSchema: {},
    annotations: readOnly,
  }, () => run('get_import_schema', async () => ({
    schemaVersion: '1.0',
    settingsGuidance,
    workflow: ['find_constitution', 'propose_constitution_setup if missing', 'editor confirms outline in the site', 'get_import_setup for constitutionId and settingsRevisionId', 'stage_constitution_import', 'editor prepares a draft in the site', 'reviewer approves', 'publisher publishes'],
    required: ['isoCode', 'countryName', 'constitutionSlug', 'constitutionTitle', 'constitutionId', 'settingsRevisionId', 'versionLabel', 'sourceUrl or gazetteReference', 'articles or roots'],
    uploadLimits: { directToolBytes: 2_097_152, chunkBytes: 524_288, chunkedItemBytes: 26_214_400, receivingBatchBytes: 104_857_600, maxItemsPerBatch: 100 },
    sourceFields: { languageCode: 'BCP 47 language tag', sourceUrl: 'HTTPS URL of the source', gazetteReference: 'Official citation or gazette reference', effectiveDate: 'YYYY-MM-DD or null' },
    structure: {
      outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article', presentation: 'section', showLabel: true, showTitle: true, showKind: false, allowTextAlongsideChildren: false, titlePolicy: 'optional', labelPolicy: 'optional', labelPlacement: 'before_title', segmentation: 'plain' }] },
      articles: [{ articleNumber: '1', title: 'Example', body: 'Text', sortOrder: 1, nodes: [] }],
      roots: [{ logicalId: 'stable UUID', kind: 'article', label: '1', title: 'Example', content: [{ type: 'text', text: 'Text' }] }],
      setupProposal: { isoCode: 'FR', countryName: 'France', constitutionSlug: 'constitution', constitutionTitle: 'Constitution', languageCode: 'fr', sourceUrl: 'https://example.org/source', outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article' }] }, sampleRoots: [{ kind: 'article', label: '1', content: [{ type: 'text', text: 'Representative text' }] }] },
    },
    notes: ['Call get_import_setup first. For an existing constitution copy its settingsRevisionId and omit outline.', 'A new constitution needs an outline proposal and a site review before content preparation.', 'Reuse an idempotencyKey when retrying a direct upload; without one, identical payloads reuse a content-derived key.', 'Use get_import_upload to resume missing chunks or cancel_import_upload to discard an unfinished upload.', 'Preserve source spelling, numbering and text order.', 'No MCP tool can approve or publish.'],
  })));

  server.registerTool('find_constitution', {
    description: 'Find a constitution by country and slug before proposing an import. Does not create records.',
    inputSchema: { countryCode: z.string().regex(/^[A-Za-z]{2}$/), constitutionSlug: z.string().trim().min(1).max(120) },
    annotations: readOnly,
  }, ({ countryCode, constitutionSlug }) => run('find_constitution', async () => {
    await requireImportKey();
    let country: CountryDetail;
    try { country = await getJson<CountryDetail>('catalog', `/countries/${countryCode.toUpperCase()}`, authorization); }
    catch (error) { if (error instanceof UpstreamError && error.status === 404) return { exists: false, countryCode: countryCode.toUpperCase() }; throw error; }
    const constitution = country.constitutions.find(item => item.slug === constitutionSlug);
    if (!constitution) return { exists: false, countryCode: country.isoCode, countryName: country.name };
    const settings = await getJson<{ id: string; outline: Record<string, unknown> }>('catalog', `/constitutions/${constitution.id}/settings`, authorization);
    return { exists: true, countryCode: country.isoCode, countryName: country.name, constitutionId: constitution.id, title: constitution.title, slug: constitution.slug, settingsRevisionId: settings.id, outline: settings.outline, settingsGuidance };
  }));

  server.registerTool('propose_constitution_setup', {
    description: 'Submit private metadata, an outline, and a small representative source sample for editor inspection before full upload.',
    inputSchema: { proposal: setupProposalSchema },
    annotations: newStagedWrite,
  }, ({ proposal }) => run('propose_constitution_setup', async () => {
    await requireImportKey();
    const result = await postJson<{ id: string; status: string }>('ingestion', '/import-setup-proposals', proposal, authorization!);
    return { proposalId: result.id, status: result.status, settingsGuidance, previewUrl: `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/admin/import/setup/${result.id}` };
  }));

  server.registerTool('get_setup_proposal', {
    description: 'Read the status of your private constitution setup proposal and the confirmed settings pin.',
    inputSchema: { proposalId: uuid },
    annotations: readOnly,
  }, ({ proposalId }) => run('get_setup_proposal', async () => {
    await requireImportKey();
    return await getJson<Record<string, unknown>>('ingestion', `/import-setup-proposals/${proposalId}`, authorization);
  }));

  server.registerTool('revise_setup_proposal', {
    description: 'Replace your unconfirmed structure proposal after inspecting validation feedback.',
    inputSchema: { proposalId: uuid, proposal: setupProposalSchema },
    annotations: stagedWrite,
  }, ({ proposalId, proposal }) => run('revise_setup_proposal', async () => {
    await requireImportKey();
    return await putJson<Record<string, unknown>>('ingestion', `/import-setup-proposals/${proposalId}`, proposal, authorization!);
  }));

  server.registerTool('get_import_setup', {
    description: 'For an editor import key, find an existing constitution and its configured content outline before uploading. A missing constitution has no outline yet.',
    inputSchema: { countryCode: z.string().regex(/^[A-Za-z]{2}$/), constitutionSlug: z.string().trim().min(1).max(120) },
    annotations: readOnly,
  }, ({ countryCode, constitutionSlug }) => run('get_import_setup', async () => {
    await requireImportKey();
    let country: CountryDetail;
    try { country = await getJson<CountryDetail>('catalog', `/countries/${countryCode.toUpperCase()}`, authorization); }
    catch (error) { if (error instanceof UpstreamError && error.status === 404) return { exists: false, countryCode: countryCode.toUpperCase(), outline: null }; throw error; }
    const constitution = country.constitutions.find(item => item.slug === constitutionSlug);
    if (!constitution) return { exists: false, countryCode: country.isoCode, outline: null };
    const settings = await getJson<{ id: string; outline: Record<string, unknown> }>('catalog', `/constitutions/${constitution.id}/settings`, authorization);
    return { exists: true, countryCode: country.isoCode, constitutionId: constitution.id, title: constitution.title, settingsRevisionId: settings.id, outline: settings.outline, settingsGuidance };
  }));

  server.registerTool('stage_constitution_import', {
    description: 'Stage one constitution version for site review. This never publishes content.',
    inputSchema: { payload: importPayloadSchema, idempotencyKey: z.string().min(8).max(128).optional() },
    annotations: stagedWrite,
  }, ({ payload, idempotencyKey }) => run('stage_constitution_import', async () => {
    await requireImportKey();
    requireDirectUploadSize(payload);
    requireConfirmedUpload(payload);
    const retryKey = idempotencyKey ?? `ca-mcp-${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    const job = await postJson<{ id: string; status: string; errors: unknown[] }>('ingestion', '/import-jobs', payload, authorization!, retryKey);
    return { jobId: job.id, status: job.status, errors: job.errors, reviewUrl: `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/admin/import/${job.id}` };
  }));

  server.registerTool('create_import_batch', {
    description: 'Create a private batch handle for up to 100 constitution items. Each item has its own review status.',
    inputSchema: {},
    annotations: newStagedWrite,
  }, () => run('create_import_batch', async () => {
    await requireImportKey();
    const batch = await postJson<{ id: string; status: string }>('ingestion', '/import-batches', {}, authorization!);
    return { batchId: batch.id, status: batch.status, reviewUrl: `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/admin/import?batch=${batch.id}` };
  }));

  server.registerTool('stage_batch_item', {
    description: 'Stage one item in a batch with a stable idempotency key. Retry the same key and payload safely.',
    inputSchema: { batchId: uuid, idempotencyKey: z.string().min(8).max(128), payload: importPayloadSchema, checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional() },
    annotations: stagedWrite,
  }, ({ batchId, idempotencyKey, payload, checksumSha256 }) => run('stage_batch_item', async () => {
    await requireImportKey();
    requireDirectUploadSize(payload);
    requireConfirmedUpload(payload);
    const item = await postJson<{ id: string; status: string; errors: unknown[] }>('ingestion', `/import-batches/${batchId}/items`, { idempotencyKey, payload, checksumSha256 }, authorization!);
    return { batchId, itemId: item.id, status: item.status, errors: item.errors, reviewUrl: `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/admin/import/${item.id}` };
  }));

  server.registerTool('get_import_batch', {
    description: 'Read independent item statuses for a batch owned by this key principal.',
    inputSchema: { batchId: uuid },
    annotations: readOnly,
  }, ({ batchId }) => run('get_import_batch', async () => {
    await requireImportKey();
    return await getJson<Record<string, unknown>>('ingestion', `/import-batches/${batchId}`, authorization);
  }));

  server.registerTool('begin_import_upload', {
    description: 'Start or resume a bounded chunked item upload in a private batch. Compute SHA-256 over the complete UTF-8 JSON bytes.',
    inputSchema: { batchId: uuid, idempotencyKey: z.string().min(8).max(128), checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/), totalBytes: z.number().int().min(1).max(25 * 1024 * 1024) },
    annotations: stagedWrite,
  }, ({ batchId, idempotencyKey, checksumSha256, totalBytes }) => run('begin_import_upload', async () => {
    await requireImportKey();
    return await postJson<Record<string, unknown>>('ingestion', `/import-batches/${batchId}/uploads`, { idempotencyKey, checksumSha256, totalBytes }, authorization!);
  }));

  server.registerTool('put_import_chunk', {
    description: 'Send one base64 chunk by index. Repeating the same index and checksum is safe; get_import_upload reports missing chunks.',
    inputSchema: { uploadId: uuid, index: z.number().int().min(0).max(49), dataBase64: z.string().min(1).max(700_000), checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/) },
    annotations: stagedWrite,
  }, ({ uploadId, index, dataBase64, checksumSha256 }) => run('put_import_chunk', async () => {
    await requireImportKey();
    return await putJson<Record<string, unknown>>('ingestion', `/import-uploads/${uploadId}/chunks/${index}`, { dataBase64, checksumSha256 }, authorization!);
  }));

  server.registerTool('get_import_upload', {
    description: 'Inspect a private upload and find the chunk indices still missing.',
    inputSchema: { uploadId: uuid },
    annotations: readOnly,
  }, ({ uploadId }) => run('get_import_upload', async () => {
    await requireImportKey();
    return await getJson<Record<string, unknown>>('ingestion', `/import-uploads/${uploadId}`, authorization);
  }));

  server.registerTool('cancel_import_upload', {
    description: 'Discard an unfinished private upload and its chunks. A completed upload has already staged an item and cannot be canceled here.',
    inputSchema: { uploadId: uuid },
    annotations: { ...stagedWrite, destructiveHint: true },
  }, ({ uploadId }) => run('cancel_import_upload', async () => {
    await requireImportKey();
    return await deleteJson<Record<string, unknown>>('ingestion', `/import-uploads/${uploadId}`, authorization!);
  }));

  server.registerTool('complete_import_upload', {
    description: 'Verify the assembled checksum and stage the completed item for site review. This never publishes.',
    inputSchema: { uploadId: uuid },
    annotations: stagedWrite,
  }, ({ uploadId }) => run('complete_import_upload', async () => {
    await requireImportKey();
    const upload = await postJson<{ itemId?: string; status: string }>('ingestion', `/import-uploads/${uploadId}/complete`, {}, authorization!);
    return { ...upload, reviewUrl: upload.itemId ? `${(process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '')}/admin/import/${upload.itemId}` : null };
  }));

  server.registerTool('get_import_job', {
    description: 'Check the review status of an import you staged.',
    inputSchema: { jobId: uuid },
    annotations: readOnly,
  }, ({ jobId }) => run('get_import_job', async () => {
    await requireImportKey();
    return await getJson<Record<string, unknown>>('ingestion', `/import-jobs/${jobId}`, authorization);
  }));

  server.registerTool('list_countries', {
    description: 'List countries with published constitutions.',
    inputSchema: page,
    annotations: readOnly,
  }, ({ offset, limit, cursor }) => run('list_countries', async () => {
    const countries = (await getJson<Country[]>('catalog', '/countries')).filter(country => country.versionCount > 0).sort((a, b) => a.isoCode.localeCompare(b.isoCode));
    const source = fingerprint(countries.map(country => country.isoCode));
    const start = cursor ? decodeCursor(cursor, 'countries', source) : offset;
    const next = start + limit < countries.length ? start + limit : null;
    return { countries: countries.slice(start, start + limit), total: countries.length, nextOffset: next, nextCursor: next === null ? null : encodeCursor('countries', source, next) };
  }));

  server.registerTool('list_constitutions', {
    description: 'List published constitutions for a country by its two-letter ISO code.',
    inputSchema: { countryCode: z.string().regex(/^[A-Za-z]{2}$/), ...page },
    annotations: readOnly,
  }, ({ countryCode, offset, limit, cursor }) => run('list_constitutions', async () => {
    const country = await getJson<CountryDetail>('catalog', `/countries/${countryCode.toUpperCase()}`);
    const constitutions = country.constitutions.filter(item => item.versions.length > 0).map(({ id, slug, title }) => ({ id, slug, title })).sort((a, b) => a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id));
    const scope = `constitutions:${country.isoCode}`;
    const source = fingerprint(constitutions.map(item => item.id));
    const start = cursor ? decodeCursor(cursor, scope, source) : offset;
    const next = start + limit < constitutions.length ? start + limit : null;
    return { countryCode: country.isoCode, countryName: country.name, constitutions: constitutions.slice(start, start + limit), total: constitutions.length, nextOffset: next, nextCursor: next === null ? null : encodeCursor(scope, source, next) };
  }));

  server.registerTool('list_versions', {
    description: 'List public published versions of one constitution.',
    inputSchema: { constitutionId: uuid, ...page },
    annotations: readOnly,
  }, ({ constitutionId, offset, limit, cursor }) => run('list_versions', async () => {
    const versions = (await getJson<Array<{ id: string; versionLabel: string; effectiveDate?: string; languageCode: string; sourceUrl?: string; gazetteReference?: string }>>('catalog', `/constitutions/${constitutionId}/versions?listing=public`))
      .sort((a, b) => (a.effectiveDate ?? '').localeCompare(b.effectiveDate ?? '') || a.id.localeCompare(b.id));
    const scope = `versions:${constitutionId}`;
    const source = fingerprint(versions.map(version => version.id));
    const start = cursor ? decodeCursor(cursor, scope, source) : offset;
    const next = start + limit < versions.length ? start + limit : null;
    return { constitutionId, versions: versions.slice(start, start + limit), total: versions.length, nextOffset: next, nextCursor: next === null ? null : encodeCursor(scope, source, next) };
  }));

  server.registerTool('get_constitution_outline', {
    description: 'Read the content hierarchy and display labels of a public constitution version.',
    inputSchema: { versionId: uuid },
    annotations: readOnly,
  }, ({ versionId }) => run('get_constitution_outline', async () => {
    const version = await requirePublishedVersion(versionId);
    const outline = await getJson<{ kinds: unknown[] }>('catalog', `/versions/${version.id}/reader-settings`);
    return { versionId, constitutionId: version.constitutionId, versionLabel: version.versionLabel, outline, url: publicVersionUrl(version) };
  }));

  server.registerTool('list_units', {
    description: 'List top-level units of a public constitution version, without their full text.',
    inputSchema: { versionId: uuid, ...page },
    annotations: readOnly,
  }, ({ versionId, offset, limit, cursor }) => run('list_units', async () => {
    const version = await requirePublishedVersion(versionId);
    const scope = `units:${versionId}`;
    const start = cursor ? decodeCursor(cursor, scope, versionId) : offset;
    const units = await getJson<Unit[]>('content', `/versions/${versionId}/units?offset=${start}&limit=${limit}&includeBody=false`);
    const next = units.length === limit ? start + limit : null;
    return { versionId, versionLabel: version.versionLabel, units: units.map(({ id, articleNumber, title, kind }) => ({ id, label: articleNumber, title, kind })), nextOffset: next, nextCursor: next === null ? null : encodeCursor(scope, versionId, next), url: publicVersionUrl(version) };
  }));

  server.registerTool('read_unit', {
    description: 'Read a bounded excerpt from one unit in a public version. Use offset to continue long text.',
    inputSchema: { versionId: uuid, unitId: uuid, offset: z.number().int().min(0).default(0), maxCharacters: z.number().int().min(100).max(20_000).default(8_000) },
    annotations: readOnly,
  }, ({ versionId, unitId, offset, maxCharacters }) => run('read_unit', async () => {
    const version = await requirePublishedVersion(versionId);
    const unit = await getJson<Unit>('content', `/versions/${versionId}/units/${unitId}`);
    if (unit.versionId !== versionId) throw new UpstreamError(404, 'content');
    const text = unit.content ? orderedText(unit.content) : unit.body ?? '';
    const excerpt = text.slice(offset, offset + maxCharacters);
    const childLogicalIds = unit.content?.filter(entry => entry.type === 'child' && entry.node?.logicalId).map(entry => entry.node!.logicalId!) ?? [];
    return { versionId, unitId, kind: unit.kind ?? 'article', label: unit.articleNumber, title: unit.title, text: excerpt, offset, nextOffset: offset + excerpt.length < text.length ? offset + excerpt.length : null, childLogicalIds, url: publicVersionUrl(version) };
  }));

  server.registerTool('resolve_unit', {
    description: 'Read one nested unit by its logical ID in a published version.',
    inputSchema: { versionId: uuid, logicalId: uuid, offset: z.number().int().min(0).default(0), maxCharacters: z.number().int().min(100).max(20_000).default(8_000) },
    annotations: readOnly,
  }, ({ versionId, logicalId, offset, maxCharacters }) => run('resolve_unit', async () => {
    const version = await requirePublishedVersion(versionId);
    const resolved = await getJson<{ versionId: string; logicalId: string; kind: string; pathLabels: string[]; text: string; deepLink: string }>('content', `/versions/${versionId}/resolve?logicalId=${logicalId}`);
    if (resolved.versionId !== versionId) throw new UpstreamError(404, 'content');
    const text = resolved.text.slice(offset, offset + maxCharacters);
    return { ...resolved, text, offset, nextOffset: offset + text.length < resolved.text.length ? offset + text.length : null, url: publicVersionUrl(version) };
  }));

  server.registerTool('search_constitutions', {
    description: 'Search published constitutional text with optional country or version filters.',
    inputSchema: { query: z.string().trim().min(1).max(200), countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(), versionId: uuid.optional(), ...page },
    annotations: readOnly,
  }, ({ query, countryCode, versionId, offset, limit }) => run('search_constitutions', async () => {
    if (versionId) await requirePublishedVersion(versionId);
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    if (countryCode) params.set('country', countryCode.toUpperCase());
    if (versionId) params.set('versionId', versionId);
    const results = await getJson<{ hits: Array<{ articleId: string; versionId: string; countryCode: string; [key: string]: unknown }>; total: number; limit: number; offset: number }>('search', `/search?${params}`);
    const base = (process.env.PUBLIC_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
    return { query, results: { ...results, hits: results.hits.map(hit => ({ ...hit, url: `${base}/countries/${encodeURIComponent(hit.countryCode)}/versions/${encodeURIComponent(hit.versionId)}/articles/${encodeURIComponent(hit.articleId)}` })) } };
  }));

  return server;
}
