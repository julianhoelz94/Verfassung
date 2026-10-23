import { createHmac } from 'node:crypto';

export const REVIEW_DOCUMENT = '01900000-0000-4000-8000-000000000801';
export const REVIEW_PROPOSAL = '01900000-0000-4000-8000-000000000802';
export const REVIEW_JOB = '01900000-0000-4000-8000-000000000701';
export const REVIEW_CORRECTION = '01900000-0000-4000-8000-000000000803';
export const REVIEW_CURRENT = '01900000-0000-4000-8000-000000000804';
export const MFA_TEST_SECRET = 'E2ESECRET';

// The mock accepts real TOTP values as well as its established fixed-code journeys.
export function testTotp(secret = MFA_TEST_SECRET) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 0, bits = 0;
  const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}

/** Additional opt-in fixture coverage for newer document and ingestion screens. */
export function reviewFixtures(germany) {
  const languages = { supported: ['en', 'de'], enabled: ['en', 'de'], defaultLanguage: 'en', managed: false };
  const setup = { status: { completed: true, tlsMode: 'local-http', publicUrl: 'https://atlas.example.org' }, preferences: { mailDeferred: false, accessReviewed: true, enabledLanguages: ['en', 'de'], defaultLanguage: 'en' }, languages, settings: [], required: [], completedAt: '2026-01-01T00:00:00Z', legacyInstallation: false };
  let settings = { selfRegistrationEnabled: true, mailEnabled: true, mailFrom: 'atlas@example.local', mailFromName: 'Constitution Atlas', mailPublicBaseUrl: 'https://atlas.example.org', smtpHost: 'mailpit', smtpPort: 1025, smtpUsername: '', smtpPasswordSet: false, smtpAuth: false, smtpStarttls: false, smtpSsl: false };
  let managedRegistration = false;
  const constitution = germany.constitutions[0];
  const legal = constitution.versions.at(-1);
  const country = { ...germany, constitutions: [{ ...constitution, versions: constitution.versions.map(v => v.id === legal.id ? { ...v, currentVersionId: REVIEW_CURRENT } : v) }] };
  const corrections = [REVIEW_CORRECTION, REVIEW_CURRENT].map((id, index) => ({ ...legal, id, legalVersionId: legal.id, currentVersionId: REVIEW_CURRENT, predecessorVersionId: index ? REVIEW_CORRECTION : legal.id, versionLabel: `2022-${index + 1}`, hopKind: 'editorial_correction', listing: 'staff', latestPublished: index === 1, publicationComment: index ? 'Corrected spacing in the transcription.' : 'Corrected a transcription typo.' }));
  const revision = { id: '01900000-0000-4000-8000-000000000805', documentId: REVIEW_DOCUMENT, revision: 1, title: 'Constitution source document', description: 'Fictional source for UI verification.', sourceUrl: 'https://example.org/source', fileName: null, contentType: null, createdAt: '2026-01-01T00:00:00Z', createdBy: '01900000-0000-4000-8000-000000000410' };
  const document = { id: REVIEW_DOCUMENT, currentRevision: 1, status: 'active', createdAt: revision.createdAt, revision };
  let proposal = { id: REVIEW_PROPOSAL, ownerId: revision.createdBy, status: 'proposed', constitutionId: null, settingsRevisionId: null, confirmedBy: null, payload: { isoCode: 'DE', countryName: 'Germany', constitutionSlug: 'review-charter', constitutionTitle: 'UI review charter', languageCode: 'en', sourceUrl: 'https://example.org/source', outline: constitution.contentOutline, sampleRoots: [] } };
  const job = { id: REVIEW_JOB, status: 'pending_review', versionId: null, isoCode: 'DE', countryName: 'Germany', constitutionTitle: 'UI review charter', versionLabel: '2026', errors: [] };
  const jurisdiction = { id: germany.id, slug: 'de', name: 'Germany', kind: 'country', code: 'DE', historical: false, parentId: null, existedFrom: null, existedUntil: null };
  const archiveRoot = { logicalId: '01900000-0000-4000-8000-000000000852', revisionId: '01900000-0000-4000-8000-000000000853', occurrenceId: '01900000-0000-4000-8000-000000000854', kind: 'article', label: '1', title: 'Rights', content: [
    { type: 'text', logicalId: '01900000-0000-4000-8000-000000000855', text: 'All people are equal.' },
    { type: 'text', logicalId: '01900000-0000-4000-8000-000000000856', text: 'Synthetic editorial source note.', format: 'footnote', footnoteLabel: 'a', annotation: { kind: 'editorial', attribution: 'UI verification fixture' } },
  ] };
  const migration = { id: '01900000-0000-4000-8000-000000000850', ownerId: revision.createdBy, manifest: { runKey: 'ui-review', title: 'Source archive review', sources: [{ sourceKey: 'missing', url: 'https://example.org/archive', aliases: [], disposition: 'unavailable', reason: 'Source is explicitly unavailable in this review state.' }] }, items: [], coverage: { sources: 1, staged: 0, prepared: 0, unavailable: 1, excluded: 0 } };
  const comparison = { id: '01900000-0000-4000-8000-000000000851', state: 'published', needsReview: false, definition: { title: 'Authored archive comparison', attribution: 'UI verification fixture', sourceUrl: 'https://example.org/comparison', sourceDocumentId: REVIEW_DOCUMENT, sourceDocumentRevision: 1,
    columns: [{ constitutionId: constitution.id, versionId: REVIEW_CURRENT, label: 'First constitution' }, { constitutionId: '01900000-0000-4000-8000-000000000857', versionId: legal.id, label: 'Second constitution' }], topics: [{ title: 'Equality', passages: [{ column: 0, logicalId: archiveRoot.logicalId }], missingColumns: [1] }] } };
  return { country, corrections, async response(req, method, pathname, readBody) {
    if (method === 'POST' && pathname === '/__sprint59_setup') {
      const body = await readBody(req);
      setup.status.completed = body.completed;
      setup.required = setup.status.completed ? [] : ['operator-details'];
      if (typeof body.mailEnabled === 'boolean') settings.mailEnabled = body.mailEnabled;
      if (typeof body.mailDeferred === 'boolean') setup.preferences.mailDeferred = body.mailDeferred;
      if (typeof body.managedRegistration === 'boolean') {
        managedRegistration = body.managedRegistration;
        setup.settings = managedRegistration ? [{ key: 'selfRegistrationEnabled', group: 'access', source: 'environment', optional: true, configured: true, editable: false }] : [];
        if (managedRegistration) settings.selfRegistrationEnabled = true;
      }
      return { ok: true };
    }
    if (method === 'GET') {
      if (pathname === '/api/catalog/jurisdictions') return [jurisdiction];
      if (pathname === `/api/catalog/jurisdictions/${germany.id}`) return { jurisdiction, ancestors: [], children: [], constitutions: country.constitutions };
      if (pathname === `/api/content/versions/${REVIEW_CURRENT}/content`) return { versionId: REVIEW_CURRENT, generation: 1, settingsRevisionId: null, roots: [archiveRoot] };
      if (pathname === '/api/ingestion/migration-runs') return [{ id: migration.id, title: migration.manifest.title, coverage: migration.coverage }];
      if (pathname === `/api/ingestion/migration-runs/${migration.id}`) return migration;
      if (pathname === '/api/catalog/curated-comparisons') return [{ id: comparison.id, title: comparison.definition.title, state: comparison.state, needsReview: false }];
      if (pathname === `/api/catalog/curated-comparisons/${comparison.id}`) return comparison;
      if (pathname === `/api/amendment/constitutions/${constitution.id}/amendment-register`) return { constitutionId: constitution.id, items: [], total: 0, offset: 0, limit: 25 };
      if (pathname === '/api/identity/setup/status') return setup.status;
      if (pathname === '/api/identity/site/languages') return languages;
      if (pathname === '/api/identity/setup') return setup;
      if (pathname === '/api/identity/admin/settings') return settings;
      if (pathname === '/api/identity/registration/status') return { enabled: settings.selfRegistrationEnabled && settings.mailEnabled && !setup.preferences.mailDeferred };
      if (pathname === '/api/identity/oauth/clients/ui-review-client') return { client_name: 'UI review client' };
      if (pathname === '/api/document/documents') return [document];
      if (pathname === `/api/document/documents/${REVIEW_DOCUMENT}`) return document;
      if (pathname === `/api/document/documents/${REVIEW_DOCUMENT}/revisions`) return [revision];
      if (pathname === `/api/document/documents/${REVIEW_DOCUMENT}/events`) return [{ id: 'created', eventType: 'created', occurredAt: revision.createdAt }];
      if (pathname === '/api/ingestion/import-jobs') return !new URL(req.url, 'http://mock').searchParams.get('status') || new URL(req.url, 'http://mock').searchParams.get('status') === job.status ? [job] : [];
      if (pathname === `/api/ingestion/import-jobs/${REVIEW_JOB}`) return job;
      if (pathname === `/api/ingestion/import-jobs/${REVIEW_JOB}/payload`) return { isoCode: 'DE', countryName: 'Germany', constitutionId: constitution.id, settingsRevisionId: '01900000-0000-4000-8000-000000000901', constitutionTitle: 'UI review charter', versionLabel: '2026', articles: [{ articleNumber: '1', title: 'Rights', body: 'All people are equal.' }] };
      if (pathname === `/api/ingestion/import-jobs/${REVIEW_JOB}/decisions`) return [];
      if (pathname === `/api/ingestion/import-setup-proposals/${REVIEW_PROPOSAL}`) return proposal;
    }
    if (method === 'PUT' && pathname === '/api/identity/setup') { setup.preferences = await readBody(req); languages.enabled = setup.preferences.enabledLanguages; languages.defaultLanguage = setup.preferences.defaultLanguage; return setup; }
    if (method === 'PUT' && pathname === '/api/identity/admin/settings') { const { smtpPassword, ...values } = await readBody(req); settings = { ...settings, ...values, smtpPasswordSet: Boolean(smtpPassword) || settings.smtpPasswordSet }; if (managedRegistration) settings.selfRegistrationEnabled = true; if (settings.mailEnabled) setup.preferences.mailDeferred = false; return settings; }
    if (method === 'POST' && pathname === '/api/ingestion/import-setup-proposals') { proposal = { ...proposal, payload: await readBody(req) }; return proposal; }
    return undefined;
  } };
}
