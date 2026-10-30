import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { digest, seedWorkflow } from './runtime.mjs';
import { namespace } from './definitions.mjs';

function pdfBytes() {
  const stream = 'BT /F1 16 Tf 36 100 Td (Constitution Atlas - synthetic source) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function pngBytes() {
  function chunk(type, body) { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(body.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, body]))); return Buffer.concat([length, name, body, crc]); }
  const header = Buffer.alloc(13); header.writeUInt32BE(64); header.writeUInt32BE(32, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(32 * (1 + 64 * 3));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const offset = y * 193 + 1 + x * 3; [pixels[offset], pixels[offset + 1], pixels[offset + 2]] = y < 16 ? [32, 76, 110] : [242, 218, 149]; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
export const assets = {
  pdf: { name: 'synthetic-source.pdf', type: 'application/pdf', bytes: pdfBytes() },
  html: { name: 'synthetic-archive.html', type: 'application/octet-stream', bytes: Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic archive capture</title><h1>Authored comparison</h1><p>Freedom in two fictional constitutions. The source records no counterpart for the second topic.</p></html>\n') },
  image: { name: 'synthetic-flag.png', type: 'image/png', bytes: pngBytes() },
};
export async function documentFixture(ctx, key, assetKey, targetId) {
  const asset = assets[assetKey]; const title = `Atlas exploration ${key}`;
  const observe = async () => {
    const knownId = ctx.journal.data.scenarios[`document:${key}`]?.resourceId;
    if (knownId) return ctx.api('GET', `document/documents/${knownId}`);
    const records = await ctx.api('GET', `document/documents?q=${encodeURIComponent(title)}`);
    const matches = records.filter(record => record.revision.sourceUrl === `https://example.org/${namespace}/${key}`);
    assert(matches.length <= 1, `${key}: duplicate documents`);
    return matches[0] ? ctx.api('GET', `document/documents/${matches[0].id}`) : null;
  };
  const steps = [() => ctx.api('POST', 'document/documents', { title, description: 'Synthetic local fixture; no external download is needed.', sourceUrl: `https://example.org/${namespace}/${key}` }, ctx.editorToken), async current => {
    const form = new FormData(); form.set('file', new Blob([asset.bytes], { type: asset.type }), asset.name);
    await ctx.api('POST', `document/documents/${current.id}/file?expectedRevision=${current.currentRevision}`, form, ctx.editorToken);
  }, current => ctx.api('PUT', `document/documents/${current.id}`, { title, description: 'Revised fixture metadata; original uploaded bytes remain pinned.', sourceUrl: `https://example.org/${namespace}/${key}`, expectedRevision: current.currentRevision }, ctx.editorToken)];
  const result = await seedWorkflow({ key: `document:${key}`, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  const record = result.value; assert(record, `${key}: document missing`);
  const revisions = await ctx.api('GET', `document/documents/${record.id}/revisions`);
  const upload = revisions.filter(revision => revision.fileName === asset.name).sort((a, b) => a.revision - b.revision)[0];
  assert(upload, `${key}: uploaded file revision missing`);
  const response = await ctx.raw('GET', `document/documents/${record.id}/revisions/${upload.revision}/file`, undefined, true);
  assert.equal(response.status, 200, `${key}: file response`);
  assert.equal(response.headers.get('content-type')?.split(';')[0], asset.type, `${key}: supported attachment MIME type`);
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(asset.bytes), `${key}: exact captured bytes`);
  if (targetId) await attach(ctx, 'constitution', targetId, record.id, upload.id);
  return { ...record, pinnedRevision: upload.revision, pinnedRevisionId: upload.id, href: `/documents/${record.id}?revision=${upload.revision}` };
}
export async function attach(ctx, type, targetId, documentId, revisionId, scopeRevisionId) {
  const path = `document/links/${type}/${targetId}`;
  const observe = async () => (await ctx.api('GET', `${path}${scopeRevisionId ? `?scopeRevisionId=${scopeRevisionId}` : ''}`)).find(link => link.documentId === documentId) ?? null;
  const result = await seedWorkflow({ key: `link:${type}:${targetId}:${documentId}:${scopeRevisionId ?? ''}`, observe, steps: [() => ctx.api('POST', path, { documentId, revisionId, ...(scopeRevisionId ? { scopeRevisionId } : {}) }, ctx.editorToken)], journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  if (!result.preserved) assert.equal(result.value?.revisionId, revisionId, 'Pinned document link');
}
