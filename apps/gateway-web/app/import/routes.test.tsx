import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import JobPage from './jobs/[jobId]/page';
import SetupPage from './setup/[proposalId]/page';
const clients = vi.hoisted(() => ({ user: vi.fn(), bearer: vi.fn(), proposal: vi.fn(), jurisdiction: vi.fn() }));
vi.mock('../../lib/session', () => ({ currentUser: clients.user, requireSessionBearer: clients.bearer }));
vi.mock('../../lib/ingestion-api', () => ({ getSetupProposal: clients.proposal }));
vi.mock('../../lib/migration-api', () => ({ getJurisdiction: clients.jurisdiction }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error('redirect:' + href); }, notFound: () => { throw new Error('notFound'); } }));
vi.mock('../editor/ImportReview', () => ({ ImportReview: ({ jobId, query, error, inboxReturnTo }: { jobId: string; query: unknown; error?: string; inboxReturnTo?: string }) => <div data-job={jobId} data-query={JSON.stringify(query)} data-error={error} data-inbox={inboxReturnTo} /> }));
vi.mock('../editor/documents/DocumentLinks', () => ({ DocumentLinks: ({ targetType, targetId, returnTo }: { targetType: string; targetId: string; returnTo: string }) => <div data-target={targetType} data-owner={targetId} data-return={returnTo} /> }));
vi.mock('../admin/import/setup/SetupProposalReview', () => ({ SetupProposalReview: ({ header, documents, identity, context }: Record<string, import('react').ReactNode>) => <>{header}{context}{identity}{documents}</> }));
const proposal = { id: 'proposal', payload: { jurisdictionId: 'region', countryName: 'Germany', isoCode: 'DE', constitutionTitle: 'Historic charter', constitutionSlug: 'charter', languageCode: 'de', sourceUrl: 'https://archive.example/charter', gazetteReference: 'Archive volume 3' } };
beforeEach(() => {
  vi.resetAllMocks(); clients.user.mockResolvedValue({ roles: ['editor'] }); clients.bearer.mockResolvedValue('Bearer actor');
  clients.proposal.mockResolvedValue(proposal); clients.jurisdiction.mockResolvedValue({ jurisdiction: { id: 'region', name: 'Historic region', historical: true } });
});
it('carries a canonical job and its source/error/inbox context into the existing review component', async () => {
  const html = renderToStaticMarkup(await JobPage({ params: Promise.resolve({ jobId: 'job/one' }), searchParams: Promise.resolve({ display: 'source', error: 'reason', inbox: '/editor?status=reviewing' }) }));
  expect(html).toContain('data-job="job/one"'); expect(html).toContain('source'); expect(html).toContain('data-error="reason"'); expect(html).toContain('data-inbox="/editor?status=reviewing"');
  clients.user.mockResolvedValue(null);
  await expect(JobPage({ params: Promise.resolve({ jobId: 'job' }), searchParams: Promise.resolve({ display: 'compare' }) })).rejects.toThrow('redirect:/login?next=%2Fimport%2Fjobs%2Fjob%3Fdisplay%3Dcompare');
});
it('preserves private setup evidence, canonical returns and historical source/identity projections', async () => {
  const html = renderToStaticMarkup(await SetupPage({ params: Promise.resolve({ proposalId: 'proposal' }), searchParams: Promise.resolve({}) }));
  expect(clients.proposal).toHaveBeenCalledWith('proposal', 'Bearer actor');
  expect(html).toContain('Historic region'); expect(html).toContain('Historical'); expect(html).toContain('Historic charter'); expect(html).toContain('Archive volume 3');
  expect(html).toContain('data-target="setup_proposal"'); expect(html).toContain('data-owner="proposal"'); expect(html).toContain('data-return="/import/setup/proposal"');
  clients.proposal.mockResolvedValue({ ...proposal, payload: { ...proposal.payload, jurisdictionId: undefined } });
  expect(renderToStaticMarkup(await SetupPage({ params: Promise.resolve({ proposalId: 'proposal' }), searchParams: Promise.resolve({}) }))).toContain('Germany');
});
it('checks setup access before service reads and retains not-found responses', async () => {
  clients.user.mockResolvedValue(null);
  await expect(SetupPage({ params: Promise.resolve({ proposalId: 'proposal' }), searchParams: Promise.resolve({ error: 'stale' }) })).rejects.toThrow('redirect:/login?next=%2Fimport%2Fsetup%2Fproposal%3Ferror%3Dstale');
  expect(clients.proposal).not.toHaveBeenCalled();
  clients.user.mockResolvedValue({ roles: ['reviewer'] });
  await SetupPage({ params: Promise.resolve({ proposalId: 'proposal' }), searchParams: Promise.resolve({}) });
  expect(clients.proposal).not.toHaveBeenCalled();
  clients.user.mockResolvedValue({ roles: ['editor'] }); clients.proposal.mockResolvedValue(null);
  await expect(SetupPage({ params: Promise.resolve({ proposalId: 'absent' }), searchParams: Promise.resolve({}) })).rejects.toThrow('notFound');
});
