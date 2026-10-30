import type { WikiPageRevision, WikiTargetType } from '../../lib/api';
import { directoryUi } from '../../lib/country-directory-messages';
import { ui } from '../../lib/messages';
import { wikiEditPath } from '../../lib/wiki-routing';
import { ContentTranslationRegion } from './ContentTranslationRegion';
import { T } from './TranslationProvider';
import { WikiContent } from './WikiContent';
import type { WikiPanelContent } from './WikiPanel';

export function directoryWikiPanel({ targetType, targetId, name, code, page, unavailable, canEdit, canReview }: { targetType: WikiTargetType; targetId: string; name: string; code?: string; page: WikiPageRevision | null; unavailable?: boolean; canEdit?: boolean; canReview?: boolean }): WikiPanelContent {
  return {
    title: <><T value={ui.countries.code.page.about} /> {name}</>,
    actions: canEdit || canReview ? <a href={wikiEditPath({ targetType, targetId, code })}><T value={canEdit ? directoryUi.editWiki : directoryUi.reviewWiki} /></a> : undefined,
    children: unavailable ? <p role="status"><T value={directoryUi.wikiUnavailable} /></p> : page ? <ContentTranslationRegion sourceLanguage="auto" compact><WikiContent page={page} /></ContentTranslationRegion> : <p><T value={directoryUi.noWiki} /></p>,
  };
}
