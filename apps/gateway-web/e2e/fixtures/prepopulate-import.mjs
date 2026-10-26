// Public catalog cards point at the latest editorial snapshot. Fixture identity
// stays on the original legal version even after someone corrects its text.
export function fixtureVersion(versions, label) {
  const version = versions?.find(item => item.versionLabel === label);
  return version && { ...version, id: version.legalVersionId ?? version.id };
}

function matchesExpected(actual, expected) {
  if (expected == null) return actual == null;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => matchesExpected(actual[i], item));
  if (typeof expected === 'object') return actual != null && Object.entries(expected).every(([key, value]) => value === undefined || matchesExpected(actual[key], value));
  return actual === expected;
}

export async function publishFixture({ api, pause, reviewerToken, publisherToken }, version, payload, request, hasPin) {
  // Find an interrupted fixture job before creating anything. Match the source
  // content too: an unrelated staff draft must never be approved by this script.
  const jobs = await api('GET', 'ingestion/import-jobs');
  let job;
  for (const candidate of jobs.filter(item => item.isoCode === payload.isoCode && !['completed', 'rejected', 'failed'].includes(item.status))) {
    const staged = await api('GET', `ingestion/import-jobs/${candidate.id}/payload`);
    const expected = { ...request, constitutionId: undefined, settingsRevisionId: undefined,
      ...(staged.outline ? { outline: payload.outline } : {}) };
    if (matchesExpected(staged, expected)) { job = candidate; break; }
  }
  job ??= await api('POST', 'ingestion/import-jobs', request, true, { 'Idempotency-Key': `atlas-fixture-${version.key}` });
  console.log(`${version.key}: import ${job.id} (${job.status})`);
  if (job.status === 'pending_review' && !job.versionId) {
    if (!hasPin && !job.outlineConfirmedBy) await api('POST', `ingestion/import-jobs/${job.id}/confirm-outline`, {}, true);
    job = await api('POST', `ingestion/import-jobs/${job.id}/prepare`, {}, true);
  }
  if (job.status === 'pending_review' && job.versionId) job = await api('POST', `ingestion/import-jobs/${job.id}/approve`, { reason: 'Fixture source and structure checked against the generated text.' }, reviewerToken);
  // A timed-out publication is reconciled by ingestion; do not submit it twice.
  for (let attempt = 0; job.status === 'publishing' && attempt < 90; attempt++) {
    await pause(2000);
    job = await api('GET', `ingestion/import-jobs/${job.id}`);
  }
  if (job.status === 'approved') job = await api('POST', `ingestion/import-jobs/${job.id}/publish`, {}, publisherToken);
  if (job.status !== 'completed' || !job.versionId) throw new Error(`Import ${version.key} is ${job.status}: ${JSON.stringify(job.errors)}; fix the stack and rerun prepopulate`);
  return job;
}
