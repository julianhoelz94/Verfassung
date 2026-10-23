import { expect, test, type APIRequestContext } from '../fixtures/consent';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminHeaders, roleHeaders, createIsolatedConstitution } from './api-fixtures';

const directory = join(__dirname, '../fixtures/legacy-archive');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function json(response: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await response.json();
  expect(response.ok(), `${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}
async function mcp(request: APIRequestContext, key: string, name: string, args: Record<string, unknown>, invalid = false) {
  const body = await json(await request.post('/mcp', {
    headers: { Accept: 'application/json, text/event-stream', Authorization: `Bearer ${key}`,
      'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {},
    } } },
  }));
  if (invalid) { expect(Boolean(body.error || body.result?.isError), JSON.stringify(body)).toBe(true); return body; }
  expect(body.result?.isError, JSON.stringify(body)).not.toBe(true);
  return body.result.structuredContent;
}

test('offline archive package preserves evidence through review, publication and legacy links', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(300_000);
  const admin = await adminHeaders(request);
  const reviewer = await roleHeaders(request, 'reviewer');
  const publisher = await roleHeaders(request, 'publisher');
  const keys: { id: string; token: string; headers: Record<string, string> }[] = [];
  async function key(headers: Record<string, string>) {
    const result = await json(await request.post('/api/identity/mcp-keys', { headers, data: {
      name: `Archive fixture ${randomUUID()}`, scopes: ['mcp:read', 'ingestion:import'],
    } }));
    keys.push({ id: result.key.id, token: result.token, headers });
    return result.token as string;
  }
  const importer = await key(admin);
  const other = await key(await roleHeaders(request, 'editor'));
  try {
    const namespace = randomUUID();
    const id = (label: string) => {
      const h = createHash('sha256').update(`${namespace}:${label}`).digest('hex');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    };
    const jurisdiction = await json(await request.post('/api/catalog/jurisdictions', { headers: admin, data: {
      slug: `archive-${namespace}`, name: `Historical fixture ${namespace}`, kind: 'region', historical: true,
    } }));
    const outline = { kinds: [
      { kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: ['paragraph'], allowTextAlongsideChildren: true },
      { kindCode: 'paragraph', displayLabel: 'Paragraph', root: false, allowedChildKinds: [] },
      { kindCode: 'appendix', displayLabel: 'Appendix', root: true, allowedChildKinds: [] },
    ] };
    const roots = [
      { logicalId: id('article'), kind: 'article', label: 'Art. I a', content: [
        { type: 'text', logicalId: id('opening'), text: 'Vorbemerkung.' },
        { type: 'child', node: { logicalId: id('paragraph'), kind: 'paragraph', label: '(1)', content: [
          { type: 'text', logicalId: id('wording'), text: manifest.legalText, references: [
            { logicalId: id('ref'), start: 4, end: 12, target: { type: 'footnote', footnoteId: id('note') } },
          ] },
        ] } },
        { type: 'text', logicalId: id('table'), format: 'table', table: { caption: 'Überlieferte Tabelle', rows: [
          { logicalId: id('row1'), cells: [{ logicalId: id('header'), text: 'Land und Stand', header: true, colSpan: 2 }] },
          { logicalId: id('row2'), cells: [{ logicalId: id('cell1'), text: 'Nord' }, { logicalId: id('cell2'), text: 'unbekannt' }] },
        ] } },
        { type: 'text', logicalId: id('note'), text: manifest.annotationText, format: 'footnote', footnoteLabel: '[a]',
          annotation: { kind: 'editorial', attribution: manifest.attribution, sourceUrl: 'https://verfassungen.de/annotated.htm', anchorLogicalIds: [id('wording')] } },
      ] },
      { logicalId: id('appendix'), kind: 'appendix', label: 'Anhang A', content: [{ type: 'text', logicalId: id('annex'), text: manifest.annexText }] },
    ];
    const proposal = await mcp(request, importer, 'propose_constitution_setup', { proposal: {
      jurisdictionId: jurisdiction.id, constitutionSlug: 'archive', constitutionTitle: 'Synthetic regional constitution', languageCode: 'de', sourceUrl: 'https://verfassungen.de/annotated.htm', outline, sampleRoots: roots,
    } });
    const setup = await json(await request.post(`/api/ingestion/import-setup-proposals/${proposal.proposalId}/confirm`, { headers: admin }));
    const captured = manifest.sources.map((source: { file: string; sha256: string; encoding: string }) => {
      const bytes = readFileSync(join(directory, source.file));
      expect(sha(bytes)).toBe(source.sha256);
      // Deterministic non-legal padding exercises interrupted multi-chunk receipt.
      const uploadBytes = source.file === 'frameset.htm' ? Buffer.concat([bytes, Buffer.from(`<!--${'x'.repeat(700_000)}-->`)]) : bytes;
      return { ...source, bytes: uploadBytes, sha256: sha(uploadBytes) };
    });
    const inventory: Record<string, unknown>[] = captured.map((source: { file: string; sha256: string; encoding: string }) => ({
      sourceKey: source.file, url: `https://verfassungen.de/${source.file}`, sha256: source.sha256, encoding: source.encoding,
      attribution: manifest.attribution, captureKey: `capture:${source.file}`, targetKeys: ['regional'],
      aliases: source.file === 'frameset.htm' ? ['https://verfassungen.de/index.htm'] : [],
    }));
    inventory.push({ sourceKey: 'unavailable', url: 'https://verfassungen.de/missing.htm', disposition: 'unavailable', reason: 'Fixture explicitly records unavailable evidence.' },
      { sourceKey: 'excluded', url: 'https://verfassungen.de/navigation.htm', disposition: 'excluded', reason: 'Navigation contains no legal text; retained in coverage.' });
    const runArgs = { runKey: namespace, title: 'Offline legacy archive fixture', sources: inventory };
    const run = await mcp(request, importer, 'create_migration_run', runArgs);
    expect((await mcp(request, importer, 'create_migration_run', runArgs)).id).toBe(run.id);
    expect((await request.get(`/api/ingestion/migration-runs/${run.id}`, { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403);
    const stage = (sourceKey: string, kind: string, payload: Record<string, unknown>, dependencies: string[] = []) =>
      mcp(request, importer, 'stage_migration_item', { runId: run.id, item: { sourceKey, kind, dependencies, payload } });
    const prepare = async (item: { id: string }) => {
      const result = await json(await request.post(`/api/ingestion/migration-runs/${run.id}/items/${item.id}/prepare`, { headers: admin }));
      expect(result.state, result.error ?? '').toBe('prepared'); return result;
    };
    for (const source of captured) {
      const item = { sourceKey: `capture:${source.file}`, kind: 'document', dependencies: [], payload: {
        title: source.file, sourceUrl: `https://verfassungen.de/${source.file}`, fileName: source.file,
        fileBase64: source.bytes.toString('base64'), fileSha256: source.sha256,
      } };
      let staged;
      if (source.file === 'frameset.htm') {
        const bytes = Buffer.from(JSON.stringify({ migrationRunId: run.id, item }));
        const batch = await mcp(request, importer, 'create_import_batch', {});
        const args = { batchId: batch.batchId, idempotencyKey: `capture-${namespace}`, totalBytes: bytes.length, checksumSha256: sha(bytes) };
        const upload = await mcp(request, importer, 'begin_import_upload', args);
        expect((await mcp(request, importer, 'begin_import_upload', args)).id).toBe(upload.id);
        const first = bytes.subarray(0, upload.chunkBytes);
        const chunk = { uploadId: upload.id, index: 0, dataBase64: first.toString('base64'), checksumSha256: sha(first) };
        await mcp(request, importer, 'put_import_chunk', chunk); await mcp(request, importer, 'put_import_chunk', chunk);
        const resumed = await mcp(request, importer, 'get_import_upload', { uploadId: upload.id });
        expect(resumed.missingChunks.length).toBeGreaterThan(0); expect(resumed.missingChunks).not.toContain(0);
        for (const index of resumed.missingChunks) {
          const part = bytes.subarray(index * upload.chunkBytes, (index + 1) * upload.chunkBytes);
          await mcp(request, importer, 'put_import_chunk', { uploadId: upload.id, index, dataBase64: part.toString('base64'), checksumSha256: sha(part) });
        }
        const completed = await mcp(request, importer, 'complete_import_upload', { uploadId: upload.id });
        expect(completed.migrationRunId).toBe(run.id); staged = { id: completed.itemId };
      } else staged = await stage(item.sourceKey, item.kind, item.payload);
      expect((await request.post(`/api/ingestion/migration-runs/${run.id}/items/${staged.id}/prepare`, { headers: { Authorization: `Bearer ${importer}` } })).status()).toBe(403);
      const document = await prepare(staged);
      const file = await request.get(`/api/document/documents/${document.result.documentId}/revisions/${document.result.revision}/file`, { headers: admin });
      expect(file.headers()['content-disposition']).toContain('attachment'); expect(sha(await file.body())).toBe(source.sha256);
    }
    const payload = { jurisdictionId: jurisdiction.id, constitutionId: setup.constitutionId, settingsRevisionId: setup.settingsRevisionId,
      constitutionSlug: 'archive', constitutionTitle: 'Synthetic regional constitution', versionLabel: 'Original nach 1849', languageCode: 'de',
      sourceUrl: 'https://verfassungen.de/annotated.htm', effectiveDate: null,
      sourceEvidence: { dateWording: 'nach 1849', datePrecision: 'uncertain', statusWording: 'historische Quelle', attribution: manifest.attribution },
      roots, expectedCounts: { ...manifest.expectedCounts, documents: captured.length } };
    const snapshot = await stage('regional', 'snapshot', payload);
    await mcp(request, importer, 'stage_constitution_import', { payload: { ...payload, roots: [{ ...roots[0], unsupportedLegalField: 'must never be stripped' }] } }, true);
    const jobId = snapshot.result.jobId;
    expect(snapshot.state).toBe('staged');
    expect((await request.get(`/api/ingestion/import-jobs/${jobId}/export?view=submitted`, { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403);
    const versionId = (await prepare(snapshot)).result.versionId;
    const readback = () => mcp(request, importer, 'export_import_job', { jobId, view: 'prepared' });
    expect((await readback()).fidelity.some((m: { path: string }) => m.path === '/counts/documents')).toBe(true);
    expect((await request.get(`/api/content/versions/${versionId}/content`)).status()).toBe(404);
    for (const source of captured) await prepare(await stage(`link:${source.file}`, 'document_link', {
      documentKey: `capture:${source.file}`, targetKey: 'regional', targetType: 'version',
    }, [`capture:${source.file}`, 'regional']));
    const fidelity = await readback();
    expect(fidelity.fidelity).toEqual([]); expect(fidelity.fidelityComplete).toBe(true); expect(fidelity.resourcesComplete).toBe(true);
    expect(fidelity.counts).toEqual(payload.expectedCounts);
    const records = [...fidelity.records]; let cursor = fidelity.nextCursor;
    while (cursor) {
      const part = await mcp(request, importer, 'export_import_job', { jobId, view: 'prepared', cursor });
      expect(part.snapshotId).toBe(fidelity.snapshotId); records.push(...part.records); cursor = part.nextCursor;
    }
    expect(records.length).toBe(fidelity.totalRecords);
    expect(records.find(r => r.path === '/roots/0/content/1/node/content/0/text')?.value).toBe(manifest.legalText);
    expect(records.find(r => r.path === '/roots/0/content/2/table/rows/0/cells/0/colSpan')?.value).toBe(2);
    expect(records.find(r => r.path === '/roots/0/content/3/annotation/kind')?.value).toBe('editorial');
    await page.context().addCookies([{ name: 'ca_session', value: admin.Authorization.slice(7), url: String(testInfo.project.use.baseURL), httpOnly: true, sameSite: 'Lax' }]);
    await page.goto(`/admin/migrations/${run.id}?item=${snapshot.id}&source=annotated.htm`);
    await expect(page.locator('pre')).toContainText(manifest.legalText);
    await expect(page.locator('pre')).toContainText('window.__legacySourceExecuted = true');
    expect(await page.evaluate(() => (window as any).__legacySourceExecuted)).toBeUndefined();
    await expect(page.getByText(manifest.legalText, { exact: true }).last()).toBeVisible();
    await json(await request.post(`/api/ingestion/import-jobs/${jobId}/approve`, { headers: reviewer, data: { reason: 'Compared exact source wording, structures, dates and linked evidence.' } }));
    await json(await request.post(`/api/ingestion/import-jobs/${jobId}/publish`, { headers: publisher }));
    const published = await json(await request.get(`/api/catalog/versions/${versionId}`));
    expect(published.effectiveDate).toBeNull(); expect(published.sourceEvidence.dateWording).toBe('nach 1849'); expect(published.jurisdictionId).toBe(jurisdiction.id);
    expect((await mcp(request, importer, 'get_migration_attempts', { runId: run.id, itemId: snapshot.id })).items[0].state).toBe('prepared');
    const national = await createIsolatedConstitution(request, 'Independent national comparison fixture', manifest.legalText);
    const nationalContent = await json(await request.get(`/api/content/versions/${national.targetVersionId}/content`));
    const comparison = await prepare(await stage('comparison', 'comparison', {
      title: 'Authored historical comparison', attribution: manifest.attribution, sourceUrl: 'https://verfassungen.de/comparison.htm', sourceDocumentKey: 'capture:comparison.htm',
      columns: [{ versionKey: 'regional', label: 'Historical region' }, { constitutionId: national.constitutionId, versionId: national.targetVersionId, label: 'Independent national text' }],
      topics: [{ title: 'Freyheit', passages: [{ column: 0, logicalId: id('paragraph') }], missingColumns: [1] },
        { title: 'Two authored passages', passages: [{ column: 0, logicalId: id('appendix') }, { column: 1, logicalId: nationalContent.roots[0].logicalId }], missingColumns: [] }],
    }, ['capture:comparison.htm', 'regional']));
    const comparisonId = comparison.result.comparisonId;
    expect((await request.get(`/api/catalog/curated-comparisons/${comparisonId}`)).status()).toBe(404);
    expect((await request.post(`/api/catalog/curated-comparisons/${comparisonId}/review`, { headers: { Authorization: `Bearer ${importer}` }, data: { reason: 'A machine must not approve.' } })).status()).toBe(403);
    await json(await request.post(`/api/catalog/curated-comparisons/${comparisonId}/review`, { headers: reviewer, data: { reason: 'Checked authored correspondences and explicit missing counterpart against the captured source.' } }));
    await json(await request.post(`/api/catalog/curated-comparisons/${comparisonId}/publish`, { headers: await roleHeaders(request, 'publisher') }));
    const original = await json(await request.get(`/api/content/versions/${versionId}/content`));
    function writes(nodes: any[]): any[] {
      return nodes.map(node => ({ logicalId: node.logicalId, predecessorRevisionId: node.revisionId, kind: node.kind, label: node.label, title: node.title,
        content: node.content.map((entry: any) => entry.node ? { type: 'child', node: writes([entry.node])[0] } : {
          type: 'text', logicalId: entry.logicalId, predecessorRevisionId: entry.revisionId, text: entry.text,
          format: entry.format, table: entry.table, footnoteLabel: entry.footnoteLabel, references: entry.references, annotation: entry.annotation,
        }) }));
    }
    const revisedRoots = writes(original.roots);
    revisedRoots[0].content[1].node.content[0].text = 'Die Freyheit jedes Bürgers bleibt unverletzlich.';
    const successor = await prepare(await stage('regional-successor', 'snapshot', { ...payload,
      versionLabel: 'Stand 1850', predecessorVersionId: versionId, hopKind: 'legal', sourceUrl: 'https://verfassungen.de/consolidated.htm',
      sourceEvidence: { dateWording: '1850', datePrecision: 'year', attribution: manifest.attribution }, roots: revisedRoots,
      expectedCounts: { ...payload.expectedCounts, documents: 0 },
    }, ['regional']));
    const successorId = successor.result.versionId;
    await json(await request.post(`/api/ingestion/import-jobs/${successor.result.jobId}/approve`, { headers: reviewer, data: { reason: 'Verified supplied consolidated snapshot; no day or legal replay was invented.' } }));
    await json(await request.post(`/api/ingestion/import-jobs/${successor.result.jobId}/publish`, { headers: await roleHeaders(request, 'publisher') }));
    const amendment = await prepare(await stage('amendment', 'amendment', { constitutionId: setup.constitutionId, record: {
      title: 'Fixture law 1850', comment: 'The source supplies only the year 1850; instrument and effective days remain unknown.',
      sourceVersionId: versionId, targetVersionId: successorId, changes: [{ articleNumber: 'Art. I a', changeType: 'changed',
        amendingLawTitle: 'Fixture law', amendingLawCitation: 'Fixture law 1850',
        beforeRef: { versionId, logicalId: id('wording') }, afterRef: { versionId: successorId, logicalId: id('wording') },
      }],
    } }, ['regional', 'regional-successor']));
    const amendmentId = amendment.result.amendmentId;
    await prepare(await stage('amendment-source', 'document_link', { documentKey: 'capture:amendments.htm', targetKey: 'amendment', targetType: 'amendment' }, ['capture:amendments.htm', 'amendment']));
    const record = await json(await request.get(`/api/amendment/amendments/${amendmentId}`, { headers: admin }));
    const diff = await json(await request.get(`/api/amendment/amendments/${amendmentId}/diff-review`, { headers: reviewer }));
    for (const candidate of diff.candidates) {
      const linked = [...candidate.beforeRefs, ...candidate.afterRefs].every(ref => ref.logicalId === id('wording'));
      await json(await request.post(`/api/amendment/amendments/${amendmentId}/diff-review/decisions`, { headers: reviewer, data: {
        expectedRevisionId: diff.revisionId, key: candidate.key, fingerprint: candidate.fingerprint,
        status: linked ? 'linked' : 'excluded_with_reason', linkedChangeIds: linked ? record.changes.map(change => change.id) : [],
        exclusionReason: linked ? undefined : 'Structural revision metadata carries the same source wording; the exact legal text change is linked separately.', reviewerAcknowledged: true,
      } }));
    }
    await json(await request.post(`/api/amendment/amendments/${amendmentId}/publish`, { headers: await roleHeaders(request, 'publisher') }));
    const registerPath = `/api/amendment/constitutions/${setup.constitutionId}/amendment-register`;
    const register = await json(await request.get(`${registerPath}?q=Fixture%20law%201850&unit=Art.%20I%20a`));
    expect(register.total).toBe(1); expect(register.items[0].enactedOn).toBeNull(); expect(register.items[0].effectiveOn).toBeNull();
    expect(register.items[0].changes[0].beforeRef.versionId).toBe(versionId); expect(register.items[0].changes[0].afterRef.versionId).toBe(successorId);
    expect((await json(await request.get(`${registerPath}?dateKind=effective&from=1850-01-01`))).total).toBe(0);
    const amendmentLinks = await json(await request.get(`/api/document/links/amendment/${amendmentId}?scopeRevisionId=${record.revisionId}`));
    expect(amendmentLinks).toHaveLength(1);
    const correction = await json(await request.post(`/api/catalog/constitutions/${setup.constitutionId}/versions`, { headers: admin, data: {
      versionLabel: 'Original transcription correction', predecessorVersionId: versionId, hopKind: 'editorial_correction',
    } }));
    const correctedRoots = writes(original.roots); correctedRoots[0].content[0].text = 'Vorbemerkung. [Transkriptionskorrektur]';
    await json(await request.put(`/api/content/versions/${correction.id}/content`, { headers: admin, data: { expectedGeneration: 0, sourceVersionId: versionId, sourceGeneration: original.generation, roots: correctedRoots } }));
    await json(await request.post(`/api/catalog/versions/${correction.id}/publish`, { headers: await roleHeaders(request, 'publisher') }));
    expect((await json(await request.get(`/api/catalog/curated-comparisons/${comparisonId}`))).needsReview).toBe(true);
    expect(await json(await request.get(`/api/content/versions/${versionId}/content`))).toEqual(original);
    expect((await request.put(`/api/content/versions/${versionId}/content`, { headers: admin, data: { expectedGeneration: original.generation, roots: [] } })).status()).toBe(409);
    const oldUrl = `http://legacy.localhost:18080/annotated-${namespace}.htm#note-a`;
    await prepare(await stage('legacy-note', 'legacy_mapping', { sourceUrl: oldUrl, kind: 'note', targetKey: 'regional', logicalId: id('note') }, ['regional']));
    const resolved = await json(await request.get(`/api/catalog/legacy-resolve?url=${encodeURIComponent(oldUrl)}`));
    expect(resolved.targetUrl).toContain(versionId); expect(resolved.targetUrl).toContain('#');
    for (const locale of ['en', 'de']) {
      const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), locale, viewport: { width: locale === 'de' ? 390 : 1280, height: 900 } });
      const reader = await context.newPage();
      await reader.goto(`/jurisdictions/${jurisdiction.id}/versions/${versionId}`);
      await expect(reader.getByText(manifest.annexText, { exact: true })).toBeVisible(); await reader.reload();
      await expect(reader.getByText('nach 1849', { exact: false }).first()).toBeVisible();
      expect(await reader.locator('html').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
      await reader.goto(`/comparisons/${comparisonId}?topic=0&columns=0,1`);
      await expect(reader.getByRole('heading', { name: 'Freyheit', exact: true })).toBeVisible();
      await expect(reader.getByText(locale === 'de' ? 'In diesem Quellenvergleich ist keine Entsprechung verzeichnet.' : 'No counterpart recorded in this source comparison.', { exact: true })).toBeVisible();
      await reader.reload(); await expect(reader).toHaveURL(/topic=0&columns=0,1/);
      expect(await reader.locator('html').evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true); await context.close();
    }
    await page.goto(oldUrl); await expect(page).toHaveURL(new RegExp(versionId));
    await expect(page.locator(':target')).toContainText(manifest.annotationText);
    const finalRun = await mcp(request, importer, 'get_migration_run', { runId: run.id });
    expect(finalRun.coverage).toMatchObject({ sources: 9, unavailable: 1, excluded: 1, published: 2, blocked: 0 });
    await testInfo.attach('legacy-migration-coverage.json', { body: JSON.stringify({ attribution: manifest.attribution, transformations: manifest.transformations,
      sources: inventory, counts: fidelity.counts, snapshotId: fidelity.snapshotId, records: records.length,
      stages: ['receipt', 'staging', 'preparation', 'review', 'publication'], coverage: finalRun.coverage, legacyTarget: resolved.targetUrl, comparisonId,
    }, null, 2), contentType: 'application/json' });
    const revoked = keys.shift()!;
    expect((await request.delete(`/api/identity/mcp-keys/${revoked.id}`, { headers: revoked.headers })).status()).toBe(204);
    expect((await request.get(`/api/ingestion/migration-runs/${run.id}`, { headers: { Authorization: `Bearer ${revoked.token}` } })).status()).toBe(401);
  } finally { for (const created of keys) await request.delete(`/api/identity/mcp-keys/${created.id}`, { headers: created.headers }); }
});
