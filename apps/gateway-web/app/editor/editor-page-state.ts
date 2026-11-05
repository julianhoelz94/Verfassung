import {
  getCountry,
  getVersion,
  listAllArticles,
  getArticle,
  listAllUnits,
  getUnit,
  getVersionSettings,
  listCountries,
  type ArticleSummary,
  type CountryDetail,
  type CountrySummary,
} from '../../lib/api';
import {
  editorErrorMessage,
  getEditorDiffReview,
  getStructuredDraft,
  type DraftPreview,
} from '../../lib/editor-api';
import { decisionReadyForReview } from '../../lib/diff-review';
import { requireSessionBearer, type SessionUser } from '../../lib/session';
import { draftDifferences, findUnitRoot, nodes } from '../../lib/structured-editor';
import { message, ui } from '../../lib/messages';
import { workflowUi } from '../../lib/workflow-messages';
import type { Locale } from '../../lib/locale';
/** Persisted editor navigation and command-result query parameters. */
export type EditorSearchParams = {
  country?: string;
  constitutionId?: string;
  scope?: string;
  selectedNode?: string;
  versionId?: string;
  sessionId?: string;
  importJobId?: string;
  articleId?: string;
  saved?: string;
  detailsSaved?: string;
  tab?: string;
  wikiStatus?: string;
  wikiHistoryPage?: string;
  reviewed?: string;
  approved?: string;
  published?: string;
  amendmentPending?: string;
  newVersionLabel?: string;
  amendmentTitle?: string;
  newVersionId?: string;
  error?: string;
  mine?: string;
  status?: string;
  workStatus?: string;
  archived?: string;
};
export type EditorCapabilities = {
  canEdit: boolean;
  canReview: boolean;
  canPublish: boolean;
};
type Structured = NonNullable<Awaited<ReturnType<typeof getStructuredDraft>>>;
/** Resolves catalog context without allowing optional country-list failure to erase a pinned session. */
async function loadCatalogContext(versionId: string) {
  let countries: CountrySummary[] = [];
  try {
    countries = (await listCountries()) ?? [];
  } catch {
    countries = [];
  }
  const countryDetails: CountryDetail[] = (
    await Promise.all(countries.map((item) => getCountry(item.isoCode)))
  ).filter((item): item is CountryDetail => item !== null);
  const staffAuthorization = await requireSessionBearer();
  const sourceVersion = await getVersion(versionId, staffAuthorization).catch(
    () => null,
  );
  const selectedCountry = countryDetails.find((country) =>
    country.constitutions.some(
      (constitution) =>
        constitution.id === sourceVersion?.constitutionId ||
        constitution.versions.some(
          (version) =>
            version.id === versionId || version.currentVersionId === versionId,
        ),
    ),
  );
  const selectedConstitution = selectedCountry?.constitutions.find(
    (constitution) =>
      constitution.id === sourceVersion?.constitutionId ||
      constitution.versions.some(
        (version) =>
          version.id === versionId || version.currentVersionId === versionId,
      ),
  );
  const selectedVersion =
    selectedConstitution?.versions.find(
      (version) =>
        version.id === versionId || version.currentVersionId === versionId,
    ) ?? sourceVersion;
  const settings = versionId
    ? await getVersionSettings(versionId, staffAuthorization)
    : null;
  const displayOutline =
    settings?.outline ?? selectedConstitution?.contentOutline;
  return {
    versionId,
    staffAuthorization,
    sourceVersion,
    selectedCountry,
    selectedConstitution,
    selectedVersion,
    settings,
    displayOutline,
  };
}
/** Uses a selected node/text identity before an explicit article and the first available root. */
function articleSelection(
  articles: ArticleSummary[],
  structured: Structured | null,
  searchParams: EditorSearchParams,
) {
  const selectionRoot = searchParams.selectedNode
    ? structured && findUnitRoot(structured.roots, searchParams.selectedNode)
    : undefined;
  const selectedId =
    (selectionRoot
      ? articles.find(
          (article) => article.logicalId === selectionRoot.logicalId,
        )?.id
      : undefined) ??
    (articles.some((article) => article.id === searchParams.articleId)
      ? searchParams.articleId
      : articles[0]?.id);
  const selectedSummary = articles.find((article) => article.id === selectedId);
  const selectedRoot = structured?.roots.find(
    (root) => root.logicalId === selectedSummary?.logicalId,
  );
  return { selectedId, selectedSummary, selectedRoot };
}
/** A draft root is already loaded; otherwise read the legacy article or version-scoped ordered unit. */
async function selectedArticle(
  selection: ReturnType<typeof articleSelection>,
  legacySource: boolean,
  versionId: string,
  staffAuthorization: string,
) {
  const { selectedRoot, selectedSummary, selectedId } = selection;
  const selected =
    selectedRoot && selectedSummary
      ? {
          ...selectedSummary,
          body: '',
          content:
            selectedRoot.content as import('../../lib/api').OrderedEntry[],
        }
      : selectedId && versionId
        ? legacySource
          ? await getArticle(selectedId, staffAuthorization)
          : await getUnit(versionId, selectedId, staffAuthorization)
        : null;
  return selected;
}
/** Loads one pinned session's content and legal diff review before selecting its displayed root. */
async function loadSessionContent(
  preview: DraftPreview,
  catalog: Awaited<ReturnType<typeof loadCatalogContext>>,
  searchParams: EditorSearchParams,
) {
  const session = preview.session;
  const { versionId, staffAuthorization } = catalog;
  const units: ArticleSummary[] = versionId
    ? await listAllUnits(versionId, false, staffAuthorization)
    : [];
  const legacySource = units.some((unit) => unit.legacyIdentity);
  const structured =
    session && !legacySource && !preview?.drafts?.length
      ? await getStructuredDraft(session.id)
      : null;
  const diffReview =
    structured && session?.hopKind === 'legal' && session.status !== 'published'
      ? await getEditorDiffReview(session.id)
      : null;
  const reviewDecisions = new Map(
    diffReview?.decisions.map((decision) => [decision.key, decision]),
  );
  const reviewComplete =
    diffReview?.candidates.every((candidate) =>
      decisionReadyForReview(candidate, reviewDecisions.get(candidate.key)),
    ) ?? true;
  const sourceArticles: ArticleSummary[] =
    legacySource && versionId
      ? await listAllArticles(versionId, false, staffAuthorization)
      : units;
  const articles: ArticleSummary[] = structured
    ? structured.roots.map((root, index) => ({
        id:
          sourceArticles.find((article) => article.logicalId === root.logicalId)
            ?.id ?? root.logicalId,
        versionId: versionId!,
        articleNumber: root.label ?? '',
        title: root.title ?? '',
        sortOrder: index + 1,
        kind: root.kind,
        logicalId: root.logicalId,
      }))
    : sourceArticles;
  const selection = articleSelection(articles, structured, searchParams);
  const selected = await selectedArticle(
    selection,
    legacySource,
    versionId,
    staffAuthorization,
  );
  const draft = selected
    ? preview?.drafts?.find((item) => item.articleId === selected.id)
    : undefined;
  return {
    units,
    legacySource,
    structured,
    diffReview,
    reviewComplete,
    sourceArticles,
    articles,
    ...selection,
    selected,
    draft,
  };
}
/** Matches node and text differences to their roots, including removed root labels in the session summary. */
function changeSummary(
  preview: DraftPreview,
  content: Awaited<ReturnType<typeof loadSessionContent>>,
  kindLabel: (kind?: string) => string,
  locale: Locale,
) {
  const { structured, sourceArticles, articles } = content;
  const differences = structured
    ? draftDifferences(structured.sourceRoots, structured.roots)
    : [];
  const changedRootIds = structured
    ? [...structured.sourceRoots, ...structured.roots]
        .filter((root) => {
          const identities = nodes([root]).flatMap((node) => [
            node.logicalId,
            ...node.content.map((entry) => entry.logicalId),
          ]);
          return differences.some((change) =>
            identities.includes(change.logicalId),
          );
        })
        .map((root) => root.logicalId)
    : [];
  const draftIds = [
    ...(preview?.drafts ?? []).map((item) => item.articleId),
    ...articles
      .filter(
        (article) =>
          article.logicalId && changedRootIds.includes(article.logicalId),
      )
      .map((article) => article.id),
  ];
  const changedLabels = articles
    .filter((article) => draftIds.includes(article.id))
    .map((article) => `${kindLabel(article.kind)} ${article.articleNumber}`);
  if (structured)
    sourceArticles
      .filter(
        (article) =>
          article.logicalId &&
          changedRootIds.includes(article.logicalId) &&
          !articles.some((target) => target.logicalId === article.logicalId),
      )
      .forEach((article) =>
        changedLabels.push(
          `${message(locale, ui.editor.publishform.removed)} ${kindLabel(article.kind)} ${article.articleNumber}`,
        ),
      );
  return { differences, changedRootIds, draftIds, changedLabels };
}
/** Keeps review readiness separate from publishing authorization and session lifecycle. */
function reviewRequirements(
  preview: DraftPreview,
  structured: Structured | null,
  reviewComplete: boolean,
) {
  const session = preview.session;
  const submissionRequirements =
    session.hopKind === 'editorial_correction' && !preview.publishComment
      ? [{ message: workflowUi.saveComment, href: '#comment' }]
      : session.hopKind === 'legal'
        ? [
            ...(!preview.changeRecord
              ? [
                  {
                    message: workflowUi.saveChangeRecord,
                    href: '#editor-change-record',
                  },
                ]
              : []),
            ...(structured &&
            preview.changeRecord &&
            !preview.changeRecord.changes?.length
              ? [
                  {
                    message: workflowUi.linkChanges,
                    href: '#editor-change-record',
                  },
                ]
              : []),
            ...(structured && !reviewComplete
              ? [
                  {
                    message: workflowUi.reviewChanges,
                    href: `#diff-review-${session.id}`,
                  },
                ]
              : []),
          ]
        : [];
  return submissionRequirements;
}
/** Builds the view model in the original request order while retaining exact published/source links. */
export async function loadEditorSession(
  preview: DraftPreview,
  user: SessionUser,
  searchParams: EditorSearchParams,
  locale: Locale,
  capabilities: EditorCapabilities,
) {
  const session = preview.session;
  const catalog = await loadCatalogContext(session.versionId);
  const content = await loadSessionContent(preview, catalog, searchParams);
  const {
    versionId,
    selectedCountry,
    selectedConstitution,
    selectedVersion,
    displayOutline,
  } = catalog;
  const { selected } = content;
  const { canEdit } = capabilities;
  const kindLabel = (kind?: string) =>
    kind
      ? (displayOutline?.kinds.find((item) => item.kindCode === kind)
          ?.displayLabel ?? kind)
      : message(locale, ui.editorDynamic.unit);
  const editorReturnTo =
    versionId && searchParams.sessionId && selected
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}&articleId=${encodeURIComponent(selected.id)}`
      : '/editor';
  const articleHrefBase =
    versionId && searchParams.sessionId
      ? `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(searchParams.sessionId)}${searchParams.scope ? `&scope=${encodeURIComponent(searchParams.scope)}` : ''}`
      : '/editor';
  const errorMessage = editorErrorMessage(searchParams.error, locale);
  const publishedHref =
    selectedCountry && preview.newVersionId
      ? `/countries/${selectedCountry.isoCode}/versions/${encodeURIComponent(preview.newVersionId)}`
      : undefined;
  const title =
    `${selectedConstitution?.title ?? message(locale, ui.remainingStatus.constitution)} · ${selectedVersion?.versionLabel ?? ''}`.trim();
  const publicHref =
    publishedHref ??
    (selectedCountry && versionId
      ? `/countries/${selectedCountry.isoCode}/versions/${encodeURIComponent(versionId)}`
      : undefined);
  const canSave = Boolean(
    canEdit &&
      session.status === 'open' &&
      selected &&
      versionId &&
      searchParams.sessionId,
  );
  return {
    ...content,
    ...changeSummary(preview, content, kindLabel, locale),
    ...capabilities,
    versionId,
    selectedCountry,
    selectedConstitution,
    selectedVersion,
    sourceVersion: catalog.sourceVersion,
    displayOutline,
    settings: catalog.settings,
    locale,
    searchParams,
    user,
    preview,
    session,
    kindLabel,
    editorReturnTo,
    articleHrefBase,
    errorMessage,
    publishedHref,
    title,
    publicHref,
    canSave,
    submissionRequirements: reviewRequirements(
      preview,
      content.structured,
      content.reviewComplete,
    ),
  };
}
export type EditorSessionState = Awaited<ReturnType<typeof loadEditorSession>>;
