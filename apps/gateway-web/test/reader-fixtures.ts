import type { Amendment, ArticleSummary, CountryDetail, VersionSummary } from '../lib/api';
/** Independently authored examples of ADR 0005's two legal editions and one correction. */
export const original: VersionSummary = { id: 'law-1949', legalVersionId: 'law-1949', currentVersionId: 'correction-1949', versionLabel: '1949', languageCode: 'de', effectiveDate: '1949-05-23', sourceUrl: 'https://archive.example/charter', gazetteReference: 'Gazette 1', provenance: 'official', verificationState: 'verified', verifiedBy: null, verifiedAt: null, latestPublished: false, hopKind: 'initial', listing: 'public' };
export const nextLaw: VersionSummary = { ...original, id: 'law-1956', legalVersionId: 'law-1956', currentVersionId: 'law-1956', versionLabel: '1956', effectiveDate: '1956-01-01', predecessorVersionId: 'law-1949', latestPublished: true, hopKind: 'legal' };
export const correction: VersionSummary = { ...original, id: 'correction-1949', hopKind: 'editorial_correction', listing: 'staff' };
export function countryFixture(): CountryDetail {
  return { id: 'country-xa', isoCode: 'XA', name: 'Test Republic', constitutions: [{ id: 'charter', slug: 'charter', title: 'Republic Charter', latestVersionId: 'law-1956', versions: [original, correction, nextLaw], lifecycleStatus: 'in_force' }] };
}
export function article(id: string, number: string, body: string): ArticleSummary {
  return { id, versionId: id.startsWith('new-') ? 'law-1956' : 'law-1949', logicalId: `logical-${number}`, articleNumber: number, title: `Provision ${number}`, body, sortOrder: Number(number), kind: 'article', children: [] };
}
export const instrument: Amendment = { id: 'instrument', constitutionId: 'charter', title: 'Voting reform', summary: 'Extends voting rights', enactedOn: '1955-12-01', effectiveOn: '1956-01-01', sourceReference: 'Gazette 2', sourceVersionId: 'correction-1949', targetVersionId: 'law-1956', status: 'published', reviewStatus: 'needs_review', publishedRevisionId: 'instrument-r1', changes: [{ id: 'change-1', articleId: null, articleNumber: '1', changeType: 'changed', note: 'Expanded electorate', changedOn: '1956-01-01' }], documents: [{ url: 'https://archive.example/reform', label: 'Official reform' }] };
