import { loginHref, safeReturnTo } from '../../../lib/return-to';
import { directoryUi } from '../../../lib/country-directory-messages';
import { getJurisdiction } from '../../../lib/migration-api';
import { wikiEditPath, wikiPublicPath, type WikiOwner } from '../../../lib/wiki-routing';
import { currentLocale } from '../../../lib/server-locale';
import { T } from '../../components/TranslationProvider';
import { notFound, redirect } from 'next/navigation';
import { getCountry, getWikiDraft, getWikiHistory, getWikiPage } from '../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { publishWikiAction, saveWikiAction } from './actions';
import { WikiEditorTemplate } from '../../components/WikiEditorTemplate';
import styles from '../../components/WikiEditorTemplate.module.css';

export type WikiQuery = { code?: string; jurisdictionId?: string; saved?: string; published?: string; error?: string; historyPage?: string };
type Props = { targetType: string; targetId: string; query: WikiQuery; embedded?: boolean; returnTo?: string };

export async function WikiWorkspace({ targetType, targetId, query, embedded = false, returnTo }: Props) {
  const locale = await currentLocale();
  const historyPage = Math.max(0, Math.min(1000, Number.parseInt(query.historyPage ?? '0', 10) || 0));
  if (targetType !== 'country' && targetType !== 'constitution' && targetType !== 'jurisdiction') notFound();
  const user = await currentUser();
  if (!user) redirect(loginHref(`/editor/wiki/${targetType}/${encodeURIComponent(targetId)}`, query));
  const canEdit = user.roles.some((role) => role === 'editor' || role === 'admin');
  const canPublish = user.roles.some((role) => role === 'publisher' || role === 'admin');
  const canReview = user.roles.includes('reviewer');
  if (!canEdit && !canPublish && !canReview) notFound();
  const jurisdiction = targetType === 'jurisdiction' || query.jurisdictionId ? await getJurisdiction(targetType === 'jurisdiction' ? targetId : query.jurisdictionId!) : null;
  if ((targetType === 'jurisdiction' || query.jurisdictionId) && jurisdiction?.jurisdiction.id !== (targetType === 'jurisdiction' ? targetId : query.jurisdictionId)) notFound();
  const country = targetType === 'country' ? await getCountry(query.code ?? '') : null;
  if (targetType === 'country' && country?.id !== targetId) notFound();
  if (targetType === 'constitution' && jurisdiction && !jurisdiction.constitutions.some(constitution => constitution.id === targetId)) notFound();
  const authorization = await requireSessionBearer();
  const [draft, published, history] = await Promise.all([
    getWikiDraft(targetType, targetId, authorization),
    getWikiPage(targetType, targetId),
    getWikiHistory(targetType, targetId, authorization, historyPage),
  ]);
  const code = query.code ?? '';
  const owner: WikiOwner = { targetType, targetId, code, jurisdictionId: query.jurisdictionId };
  const publicHref = wikiPublicPath(owner) + (targetType === 'constitution' ? '' : '?wiki=1');
  const targetName = country?.name ?? jurisdiction?.jurisdiction.name;
  function historyHref(page: number) {
    if (embedded && returnTo) {
      const url = new URL(safeReturnTo(returnTo, '/editor'), 'http://atlas.local');
      url.searchParams.set('tab', 'wiki'); url.searchParams.set('wikiHistoryPage', String(page)); url.searchParams.delete('wikiStatus');
      return url.pathname + url.search;
    }
    return wikiEditPath(owner, { historyPage: String(page) });
  }

  return <WikiEditorTemplate owner={owner} title={<><T value={canEdit ? directoryUi.editWiki : directoryUi.reviewWiki} />{targetName ? ` · ${targetName}` : ''}</>} publicHref={publicHref} locale={locale} draft={draft} published={published} history={history} historyPage={historyPage} historyHref={historyHref} query={query} embedded={embedded} returnTo={returnTo} canEdit={canEdit} canPublish={canPublish} canReview={canReview} saveAction={saveWikiAction} publishAction={publishWikiAction} />;
}

export async function ConstitutionWikiPanel({ constitutionId, code, returnTo, status, historyPage }: { constitutionId: string; code: string; returnTo: string; status?: 'saved' | 'published' | 'error'; historyPage?: string }) {
  try {
    return await WikiWorkspace({ targetType: 'constitution', targetId: constitutionId, query: { code, historyPage, ...(status ? { [status]: '1' } : {}) }, embedded: true, returnTo });
  } catch {
    return <section className={styles.workspace}><p role="status"><T value={{ en: 'The Wiki could not be loaded. Your text draft is still available.', de: 'Das Wiki konnte nicht geladen werden. Ihr Textentwurf bleibt verfügbar.' }} /></p><a href={'/editor/wiki/constitution/'+encodeURIComponent(constitutionId)+'?code='+encodeURIComponent(code)}><T value={{ en: 'Open Wiki editor', de: 'Wiki-Bearbeitung öffnen' }} /></a></section>;
  }
}
