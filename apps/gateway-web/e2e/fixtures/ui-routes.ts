const country = '/countries/DE';
const constitution = '01900000-0000-4000-8000-000000000002';
const version = '01900000-0000-4000-8000-000000000804';
const article = '01900000-0000-4000-8000-000000000201';
const document = '01900000-0000-4000-8000-000000000801';
const proposal = '01900000-0000-4000-8000-000000000802';
const amendment = '01900000-0000-4000-8000-000000000302';

export const uiRoutes = [
  { entry: '/', path: '/' },
  { entry: '/about', path: '/about' },
  { entry: '/account', path: '/account', staff: true, snapshot: true },
  { entry: '/account/step-up', path: '/account/step-up', staff: true },
  { entry: '/admin', path: '/admin', staff: true, snapshot: true },
  { entry: '/admin/anonymous-browsing', path: '/admin/anonymous-browsing', staff: true, snapshot: true },
  { entry: '/admin/constitutions', path: '/admin/constitutions', staff: true },
  { entry: '/admin/constitutions/[id]', path: `/admin/constitutions/${constitution}`, staff: true, snapshot: true },
  { entry: '/admin/import', path: '/admin/import', staff: true, snapshot: true },
  { entry: '/admin/import/[jobId]', path: '/admin/import/01900000-0000-4000-8000-000000000701', staff: true },
  { entry: '/admin/import/setup/[proposalId]', path: `/admin/import/setup/${proposal}`, staff: true, snapshot: true },
  { entry: '/admin/legal/[key]', path: '/admin/legal/impressum', staff: true, snapshot: true },
  { entry: '/admin/settings', path: '/admin/settings', staff: true, snapshot: true },
  { entry: '/admin/users', path: '/admin/users', staff: true, snapshot: true },
  { entry: '/countries/[code]', path: country },
  { entry: '/countries/[code]/articles/[articleNumber]', path: `${country}/articles/1` },
  { entry: '/countries/[code]/compare', path: `${country}/compare` },
  { entry: '/countries/[code]/constitution-timeline', path: `${country}/constitution-timeline?on=2026-01-01`, snapshot: true },
  { entry: '/countries/[code]/constitutions/[constitutionId]', path: `${country}/constitutions/${constitution}`, snapshot: true },
  { entry: '/countries/[code]/timeline', path: `${country}/timeline?on=2026-01-01` },
  { entry: '/countries/[code]/versions/[versionId]', path: `${country}/versions/${version}` },
  { entry: '/countries/[code]/versions/[versionId]/articles/[articleId]', path: `${country}/versions/${version}/articles/${article}` },
  { entry: '/countries/[code]/versions/[versionId]/units/[unitId]', path: `${country}/versions/${version}/units/${article}`, snapshot: true },
  { entry: '/datenschutz', path: '/datenschutz' },
  { entry: '/documents/[id]', path: `/documents/${document}`, snapshot: true },
  { entry: '/editor', path: '/editor', staff: true },
  { entry: '/editor/amendments', path: '/editor/amendments', staff: true, snapshot: true },
  { entry: '/editor/amendments/[id]', path: `/editor/amendments/${amendment}`, staff: true, snapshot: true },
  { entry: '/editor/documents', path: '/editor/documents', staff: true, snapshot: true },
  { entry: '/editor/documents/new', path: '/editor/documents/new', staff: true, snapshot: true },
  { entry: '/editor/documents/[id]', path: `/editor/documents/${document}`, staff: true, snapshot: true },
  { entry: '/editor/history', path: '/editor/history', staff: true, snapshot: true },
  { entry: '/editor/lifecycle/[constitutionId]', path: `/editor/lifecycle/${constitution}?code=DE`, staff: true, snapshot: true },
  { entry: '/editor/wiki/[targetType]/[targetId]', path: '/editor/wiki/country/01900000-0000-4000-8000-000000000001?code=DE', staff: true, snapshot: true },
  { entry: '/impressum', path: '/impressum' },
  { entry: '/invite', path: '/invite?token=e2e-invite-token' },
  { entry: '/login', path: '/login' },
  { entry: '/login/mfa', path: '/login/mfa', challenged: true, snapshot: true },
  { entry: '/oauth/authorize', path: '/oauth/authorize?client_id=ui-review-client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&resource=http%3A%2F%2Flocalhost%2Fmcp&response_type=code&code_challenge_method=S256&code_challenge=review', staff: true, snapshot: true },
  { entry: '/register', path: '/register', snapshot: true },
  { entry: '/register/confirm', path: '/register/confirm?token=review-confirmation' },
  { entry: '/reset', path: '/reset?token=e2e-reset-token' },
  { entry: '/search', path: '/search?q=dignity' },
  { entry: '/versions/[versionId]/units/[unitId]', path: `/versions/${version}/units/${article}` },
  { entry: '/setup', path: '/setup', staff: true, setup: true, snapshot: true },
] satisfies Array<{ entry: string; path: string; staff?: boolean; challenged?: boolean; setup?: boolean; snapshot?: boolean }>;

// Query and dynamic variants that share an entry point but expose another task.
export const uiStates = [
  { entry: 'import-new-structure', path: '/admin/import?mode=new', staff: true, snapshot: true },
  { entry: 'legal-privacy-de', path: '/admin/legal/datenschutz', staff: true },
  { entry: 'legal-privacy-en', path: '/admin/legal/datenschutz_en', staff: true },
  { entry: 'legal-imprint-en', path: '/admin/legal/impressum_en', staff: true },
  { entry: 'editor-review-queue', path: '/editor?status=reviewing', staff: true },
  { entry: 'editor-publication-queue', path: '/editor?status=approved', staff: true },
  { entry: 'new-legal-change', path: `/editor/amendments/new?constitutionId=${constitution}`, staff: true, snapshot: true },
  { entry: 'constitution-wiki', path: `/editor/wiki/constitution/${constitution}?code=DE`, staff: true },
  { entry: 'editor-active-correction', path: `/editor?sessionId=01900000-0000-4000-8000-000000000501&versionId=${version}`, staff: true, session: true, snapshot: true },
] satisfies Array<{ entry: string; path: string; staff?: boolean; session?: boolean; snapshot?: boolean }>;
