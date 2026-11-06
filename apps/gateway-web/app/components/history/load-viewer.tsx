import { ServiceUnavailable } from "../StatusMessage";
import { ReaderPage } from "../layout/templates";
import { notFound } from "next/navigation";
import { loadConstitutionCollection } from "../../../lib/country-directory";
import {
  getConstitutionEvents,
  getWikiPage,
  listConstitutionAmendments,
} from "../../../lib/api";
import { publicVersions, snapshotVersionId } from "../../../lib/reading";
import { orderVersions } from "../../../lib/compare";
import { currentLocale } from "../../../lib/server-locale";
import { currentUser } from "../../../lib/session";
import { lifecycleStatusMessage } from "../../../lib/lifecycle-label";
import { ui } from "../../../lib/messages";
import { Breadcrumbs } from "../Breadcrumbs";
import { T } from "../TranslationProvider";
import { WikiContent } from "../WikiContent";
import { VersionDocuments } from "../VersionDocuments";

export type ViewerParams = {
  code?: string;
  id?: string;
  constitutionId: string;
};
export type ViewerQuery = Record<string, string | undefined>;

export async function loadViewer(params: ViewerParams) {
  const context = await loadConstitutionCollection(params).catch(
    () => undefined,
  );
  if (context === undefined) return null;
  if (!context) notFound();
  const constitution = context.collection.constitutions.find(
    (c) => c.id === params.constitutionId,
  );
  if (!constitution) notFound();
  const [amendments, events, wiki, locale, user] = await Promise.all([
    listConstitutionAmendments(constitution.id).catch(() => null),
    getConstitutionEvents(constitution.id).catch(() => null),
    getWikiPage("constitution", constitution.id).catch(() => null),
    currentLocale(),
    currentUser(),
  ]);
  const versions = orderVersions(publicVersions(constitution.versions));
  const owner = context.owner.href,
    base = `${owner}/constitutions/${constitution.id}`;
  const latest = versions.at(-1),
    latestHref = latest
      ? `${owner}/versions/${snapshotVersionId(latest)}`
      : undefined;
  const canEdit = Boolean(
    user?.roles.some((r) => r === "editor" || r === "admin"),
  );
  const canPublish = Boolean(
    user?.roles.some((r) => r === "publisher" || r === "admin"),
  );
  const staff = Boolean(
    user?.roles.some((r) =>
      ["editor", "reviewer", "publisher", "admin"].includes(r),
    ),
  );
  const breadcrumbs = (
    <Breadcrumbs
      items={[
        { href: "/", label: <T value={ui.nav.countries} /> },
        { href: owner, label: context.owner.name },
        { label: constitution.title },
      ]}
    />
  );
  const wikiContent = (
    <>
      {wiki ? (
        <WikiContent page={wiki} />
      ) : (
        <p>
          <T
            value={{
              en: "No Wiki article has been published yet.",
              de: "Es wurde noch kein Wiki-Artikel veröffentlicht.",
            }}
          />
        </p>
      )}
      {canEdit ? (
        <p>
          <a
            href={`/editor/wiki/constitution/${constitution.id}?${params.id ? "jurisdictionId=" + params.id : "code=" + params.code}`}
          >
            <T value={{ en: "Edit Wiki", de: "Wiki bearbeiten" }} />
          </a>
        </p>
      ) : null}
    </>
  );
  const related = context.collection.constitutions.filter(
    (c) =>
      c.id === constitution.predecessorConstitutionId ||
      c.predecessorConstitutionId === constitution.id,
  );
  const details = (
    <>
      <h2>{constitution.title}</h2>
      <p>
        {context.owner.name} ·{" "}
        <T value={lifecycleStatusMessage(constitution.lifecycleStatus)} />
      </p>
      {related.length ? (
        <>
          <h3>
            <T
              value={{
                en: "Related constitutions",
                de: "Verwandte Verfassungen",
              }}
            />
          </h3>
          <ul>
            {related.map((c) => (
              <li key={c.id}>
                <a href={`${owner}/constitutions/${c.id}`}>{c.title}</a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <VersionDocuments
        compact
        constitutionId={constitution.id}
        versionId={latest ? snapshotVersionId(latest) : ""}
      />
    </>
  );
  return {
    ...context,
    constitution,
    amendments,
    events,
    locale,
    user,
    versions,
    owner,
    base,
    latestHref,
    canEdit,
    canPublish,
    staff,
    breadcrumbs,
    wiki: wikiContent,
    details,
  };
}

export type ViewerModel = NonNullable<Awaited<ReturnType<typeof loadViewer>>>;
export function ViewerUnavailable({ params }: { params: ViewerParams }) {
  const owner = params.id
    ? `/jurisdictions/${params.id}`
    : `/countries/${params.code}`;
  return (
    <ReaderPage>
      <ServiceUnavailable
        service={ui.services.catalog}
        retryHref={`${owner}/constitutions/${params.constitutionId}`}
      />
    </ReaderPage>
  );
}
