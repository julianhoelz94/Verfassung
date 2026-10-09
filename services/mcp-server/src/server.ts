import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { getJson, publicVersionUrl, requirePublishedVersion, UpstreamError } from './catalog.js';

const uuid = z.string().uuid();
const page = { offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(50).default(20) };
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });

type Country = { isoCode: string; name: string; versionCount: number };
type CountryDetail = { isoCode: string; name: string; constitutions: Array<{ id: string; slug: string; title: string; versions: unknown[] }> };
type OrderedEntry = { type: string; text?: string | null; node?: { logicalId?: string; content?: OrderedEntry[] } | null };
type Unit = { id: string; versionId: string; articleNumber: string; title: string; body?: string; kind?: string; children?: Array<{ id: string }>; content?: OrderedEntry[] };

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

async function run<T extends Record<string, unknown>>(tool: string, action: () => Promise<T>) {
  const started = Date.now();
  try {
    const result = json(await action());
    console.info(JSON.stringify({ event: "mcp_tool", tool, outcome: "ok", elapsedMs: Date.now() - started }));
    return result;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'mcp_tool', tool, outcome: 'error', status: error instanceof UpstreamError ? error.status : 503, elapsedMs: Date.now() - started }));
    const message = error instanceof UpstreamError ? error.message : 'The requested data could not be loaded.';
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'constitution-atlas', version: '0.1.0' }, { capabilities: { tools: {} } });

  server.registerTool('list_countries', {
    description: 'List countries with published constitutions.',
    inputSchema: page,
  }, ({ offset, limit }) => run('list_countries', async () => {
    const countries = (await getJson<Country[]>('catalog', '/countries')).filter(country => country.versionCount > 0);
    return { countries: countries.slice(offset, offset + limit), total: countries.length, nextOffset: offset + limit < countries.length ? offset + limit : null };
  }));

  server.registerTool('list_constitutions', {
    description: 'List published constitutions for a country by its two-letter ISO code.',
    inputSchema: { countryCode: z.string().regex(/^[A-Za-z]{2}$/), ...page },
  }, ({ countryCode, offset, limit }) => run('list_constitutions', async () => {
    const country = await getJson<CountryDetail>('catalog', `/countries/${countryCode.toUpperCase()}`);
    const constitutions = country.constitutions.filter(item => item.versions.length > 0).map(({ id, slug, title }) => ({ id, slug, title }));
    return { countryCode: country.isoCode, countryName: country.name, constitutions: constitutions.slice(offset, offset + limit), total: constitutions.length, nextOffset: offset + limit < constitutions.length ? offset + limit : null };
  }));

  server.registerTool('list_versions', {
    description: 'List public published versions of one constitution.',
    inputSchema: { constitutionId: uuid, ...page },
  }, ({ constitutionId, offset, limit }) => run('list_versions', async () => {
    const versions = await getJson<Array<{ id: string; versionLabel: string; effectiveDate?: string; languageCode: string; sourceUrl?: string; gazetteReference?: string }>>('catalog', `/constitutions/${constitutionId}/versions?listing=public`);
    return { constitutionId, versions: versions.slice(offset, offset + limit), total: versions.length, nextOffset: offset + limit < versions.length ? offset + limit : null };
  }));

  server.registerTool('get_constitution_outline', {
    description: 'Read the content hierarchy and display labels of a public constitution version.',
    inputSchema: { versionId: uuid },
  }, ({ versionId }) => run('get_constitution_outline', async () => {
    const version = await requirePublishedVersion(versionId);
    const outline = await getJson<{ kinds: unknown[] }>('catalog', `/versions/${version.id}/reader-settings`);
    return { versionId, constitutionId: version.constitutionId, versionLabel: version.versionLabel, outline, url: publicVersionUrl(version) };
  }));

  server.registerTool('list_units', {
    description: 'List top-level units of a public constitution version, without their full text.',
    inputSchema: { versionId: uuid, ...page },
  }, ({ versionId, offset, limit }) => run('list_units', async () => {
    const version = await requirePublishedVersion(versionId);
    const units = await getJson<Unit[]>('content', `/versions/${versionId}/units?offset=${offset}&limit=${limit}&includeBody=false`);
    return { versionId, versionLabel: version.versionLabel, units: units.map(({ id, articleNumber, title, kind }) => ({ id, label: articleNumber, title, kind })), nextOffset: units.length === limit ? offset + limit : null, url: publicVersionUrl(version) };
  }));

  server.registerTool('read_unit', {
    description: 'Read a bounded excerpt from one unit in a public version. Use offset to continue long text.',
    inputSchema: { versionId: uuid, unitId: uuid, offset: z.number().int().min(0).default(0), maxCharacters: z.number().int().min(100).max(20_000).default(8_000) },
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
  }, ({ query, countryCode, versionId, offset, limit }) => run('search_constitutions', async () => {
    if (versionId) await requirePublishedVersion(versionId);
    const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
    if (countryCode) params.set('country', countryCode.toUpperCase());
    if (versionId) params.set('versionId', versionId);
    const results = await getJson<Record<string, unknown>>('search', `/search?${params}`);
    return { query, results };
  }));

  return server;
}
