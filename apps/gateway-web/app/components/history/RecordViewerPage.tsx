import { ReaderIcon } from "../ReaderIcon";
import { notFound } from "next/navigation";
import {
  historyHref,
  recordReturn,
  type ViewerLocation,
} from "../../../lib/constitution-viewer";
import { listDocumentLinks } from "../../../lib/document-api";
import { ui, message } from "../../../lib/messages";
import { FormattedDate } from "../../../lib/format-date";
import { FullWidthPage } from "../layout/PageChrome";
import { T } from "../TranslationProvider";
import { ConstitutionViewer } from "./ConstitutionViewer";
import { PassageChange } from "./PassageChange";
import { loadPassageWording } from "./passage-wording";
import { RecordMaterials } from "./RecordMaterials";
import {
  ViewerUnavailable,
  loadViewer,
  type ViewerParams,
  type ViewerQuery,
} from "./load-viewer";
import styles from "./ConstitutionHistory.module.css";

function recordHistory(
  owner: string,
  constitutionId: string,
  location: ViewerLocation,
  returnTo?: string,
) {
  const extra: Record<string, string> = {};
  if (returnTo) {
    const url = new URL(returnTo, "https://atlas.invalid");
    if (url.pathname === `${owner}/constitutions/${constitutionId}`)
      for (const key of [
        "passage",
        "sourceVersion",
        "sourceAnchor",
        "kind",
        "year",
        "q",
      ]) {
        const value = url.searchParams.get(key);
        if (value) extra[key] = value;
      }
  }
  return historyHref(owner, constitutionId, location, extra);
}
function LifecycleEvidenceStatus({ query }: { query: ViewerQuery }) {
  if (query.error)
    return (
      <p role="alert">
        <T
          value={{
            en: "The event evidence could not be saved. Reload the editor to check the current revision.",
            de: "Die Ereignisbelege konnten nicht gespeichert werden. Laden Sie den Editor neu, um die aktuelle Revision zu prüfen.",
          }}
        />
      </p>
    );
  if (query.saved)
    return (
      <p role="status">
        <T
          value={{
            en: "Event evidence saved.",
            de: "Ereignisbelege gespeichert.",
          }}
        />
      </p>
    );
  return null;
}

function MaterialStatus({ query }: { query: ViewerQuery }) {
  return query.materialsError ? (
    <p role="alert">
      <T
        value={{
          en: "The material could not be saved. Reload and check the current record before trying again.",
          de: "Das Material konnte nicht gespeichert werden. Laden Sie die Seite neu und prüfen Sie den aktuellen Eintrag vor einem erneuten Versuch.",
        }}
      />
    </p>
  ) : query.materialsSaved ? (
    <p role="status">
      <T value={{ en: "Material saved.", de: "Material gespeichert." }} />
    </p>
  ) : null;
}

export async function AmendmentViewerPage({
  params,
  searchParams,
}: {
  params: Promise<ViewerParams & { amendmentId: string }>;
  searchParams: Promise<ViewerQuery>;
}) {
  const [values, query] = await Promise.all([params, searchParams]),
    model = await loadViewer(values);
  if (!model || model.amendments === null)
    return <ViewerUnavailable params={values} />;
  const amendment = model.amendments.find((a) => a.id === values.amendmentId);
  if (!amendment) notFound();
  const changes = await loadPassageWording(amendment.changes, model.constitution.id);
  const href = `${model.base}/amendments/${amendment.id}`,
    returnTo = recordReturn(query.return, model.owner);
  const publicHref =
    href + (returnTo ? "?return=" + encodeURIComponent(returnTo) : "");
  const editorHref = `/editor/amendments/${amendment.id}?returnTo=${encodeURIComponent(publicHref)}`;
  const documents = await listDocumentLinks(
    "amendment",
    amendment.id,
    amendment.publishedRevisionId,
  ).catch(() => null);
  const history = recordHistory(
    model.owner,
    model.constitution.id,
    {
      kind: "amendment",
      id: amendment.id,
      label: amendment.title,
      href: publicHref,
    },
    returnTo,
  );
  const navigation = (
    <nav
      className={styles.nav}
      aria-label={message(model.locale, {
        en: "In this amendment",
        de: "In dieser Änderung",
      })}
    >
      <p className={styles.eyebrow}>
        <T value={{ en: "In this amendment", de: "In dieser Änderung" }} />
      </p>
      {changes.map((change, index) => (
        <a key={change.id} href={"#change-" + change.id}>
          {String(index + 1).padStart(2, "0")} ·{" "}
          {change.afterRef?.label ??
            change.beforeRef?.label ??
            change.articleNumber}
          <small>
            {change.afterRef?.breadcrumbs?.join(" › ") ??
              change.beforeRef?.breadcrumbs?.join(" › ")}
          </small>
        </a>
      ))}
      <a href="#amendment-materials">
        <T
          value={{
            en: "Commentary & materials",
            de: "Kommentare & Materialien",
          }}
        />
      </a>
    </nav>
  );
  return (
    <FullWidthPage template="reader">
      <ConstitutionViewer
        breadcrumbs={model.breadcrumbs}
        mode="read"
        readHref={publicHref}
        historyHref={history}
        wiki={model.wiki}
        details={model.details}
        navigation={navigation}
      >
        {returnTo &&
        (returnTo.includes("/compare?") ||
          new URL(returnTo, "https://atlas.invalid").searchParams.has(
            "passage",
          )) ? (
          <p>
            <a href={returnTo}>
              ←{" "}
              <T
                value={
                  returnTo.includes("/compare?")
                    ? { en: "Back to comparison", de: "Zurück zum Vergleich" }
                    : {
                        en: "Back to passage history",
                        de: "Zurück zur Passagengeschichte",
                      }
                }
              />
            </a>
          </p>
        ) : null}
        <div className={styles.meta}>
          <span className={styles.badge}>
            <T value={{ en: "Amendment", de: "Änderung" }} />
          </span>
          <span>
            <T value={{ en: "Published", de: "Veröffentlicht" }} />
          </span>
          <span className={styles.spacer} />
          {model.canEdit ? (
            <a href={editorHref}>
              <T value={{ en: "Edit amendment", de: "Änderung bearbeiten" }} />
            </a>
          ) : model.staff ? (
            <a href={editorHref}>
              <T
                value={{ en: "Open workspace", de: "Arbeitsbereich öffnen" }}
              />
            </a>
          ) : null}
        </div>
        <h1>{amendment.title}</h1>
        <p className={styles.lede}>
          {model.constitution.title}
          {amendment.sourceReference ? " · " + amendment.sourceReference : ""}
        </p>
        <div className={styles.meta}>
          <span>
            <T value={{ en: "Enacted", de: "Beschlossen" }} />{" "}
            <FormattedDate value={amendment.enactedOn} />
          </span>
          <span>
            <T value={{ en: "Effective", de: "Wirksam" }} />{" "}
            <FormattedDate value={amendment.effectiveOn} />
          </span>
        </div>
        {amendment.comment || amendment.summary ? (
          <p className={styles.comment}>
            {amendment.comment || amendment.summary}
          </p>
        ) : null}
        <MaterialStatus query={query} />
        <h2>
          <T value={{ en: "Affected passages", de: "Betroffene Passagen" }} />
        </h2>
        {changes.map((change, index) => (
          <div key={change.id}>
            <PassageChange change={change} />
            {model.canEdit ? (
              <p>
                <a
                  href={
                    editorHref +
                    "&passage=" +
                    (index + 1) +
                    "#amendment-changes-title"
                  }
                >
                  <T
                    value={{
                      en: "Edit this change",
                      de: "Diese Änderung bearbeiten",
                    }}
                  />
                </a>
              </p>
            ) : null}
            <RecordMaterials
              targetType="change_material"
              targetId={amendment.id}
              scope={change.id}
              editable={model.canEdit}
              compact
              returnTo={publicHref + "#change-" + change.id}
            />
          </div>
        ))}
        <section id="amendment-materials">
          <RecordMaterials
            targetType="amendment_material"
            targetId={amendment.id}
            editable={model.canEdit}
            returnTo={publicHref + "#amendment-materials"}
          />
        </section>
        <section>
          <h2>
            <T value={{ en: "Evidence & sources", de: "Belege & Quellen" }} />
          </h2>
          {documents === null ? (
            <p>
              <T
                value={{
                  en: "Source documents are temporarily unavailable.",
                  de: "Quelldokumente sind vorübergehend nicht verfügbar.",
                }}
              />
            </p>
          ) : null}
          <ul>
            {documents?.map((d) => (
              <li key={d.documentId}>
                <a
                  href={`/documents/${d.documentId}?revision=${d.document.revision.revision}`}
                >
                  {d.document.revision.title}
                </a>
              </li>
            ))}
            {amendment.documents
              ?.filter(
                (d) =>
                  d.url?.startsWith("https://") || d.url?.startsWith("http://"),
              )
              .map((d, i) => (
                <li key={i}>
                  <a href={d.url!}>{d.label || d.url}</a>
                </li>
              ))}
          </ul>
        </section>
      </ConstitutionViewer>
    </FullWidthPage>
  );
}

export async function LifecycleViewerPage({
  params,
  searchParams,
}: {
  params: Promise<ViewerParams & { eventId: string }>;
  searchParams: Promise<ViewerQuery>;
}) {
  const [values, query] = await Promise.all([params, searchParams]),
    model = await loadViewer(values);
  if (!model || model.events === null)
    return <ViewerUnavailable params={values} />;
  const event = model.events.find((e) => e.id === values.eventId);
  if (!event) notFound();
  const href = `${model.base}/events/${event.id}`,
    returnTo = recordReturn(query.return, model.owner);
  const publicHref =
    href + (returnTo ? "?return=" + encodeURIComponent(returnTo) : "");
  const title = message(model.locale, ui.lifecycleEvents[event.eventType]);
  const history = recordHistory(
    model.owner,
    model.constitution.id,
    { kind: "event", id: event.id, label: title, href: publicHref },
    returnTo,
  );
  const related =
    model.versions.find((v) => v.effectiveDate === event.eventDate) ??
    (event.eventType === "adopted" || event.eventType === "commenced"
      ? model.versions[0]
      : undefined);
  return (
    <FullWidthPage template="reader">
      <ConstitutionViewer
        breadcrumbs={model.breadcrumbs}
        mode="read"
        readHref={publicHref}
        historyHref={history}
        wiki={model.wiki}
        details={model.details}
        navigation={
          <nav className={styles.nav} aria-label={title}>
            <p className={styles.eyebrow}>
              <T value={{ en: "In this event", de: "In diesem Ereignis" }} />
            </p>
            <a href="#event-overview">
              <T value={{ en: "Overview", de: "Überblick" }} />
            </a>
            <a href="#event-materials">
              <T
                value={{
                  en: "Commentary & materials",
                  de: "Kommentare & Materialien",
                }}
              />
            </a>
          </nav>
        }
      >
        {returnTo?.includes("/compare?") ? (
          <p>
            <a href={returnTo}>
              ←{" "}
              <T
                value={{ en: "Back to comparison", de: "Zurück zum Vergleich" }}
              />
            </a>
          </p>
        ) : null}
        <div className={styles.meta}>
          <span className={styles.badge}>
            <T value={{ en: "Lifecycle event", de: "Lebenszyklusereignis" }} />
          </span>
          <span>
            <T value={{ en: "Published", de: "Veröffentlicht" }} />
          </span>
          <span className={styles.spacer} />
          {model.canPublish ? (
            <a
              href={`/editor/lifecycle/${model.constitution.id}?${values.id ? "jurisdictionId=" + values.id : "code=" + values.code}&eventId=${event.id}&returnTo=${encodeURIComponent(publicHref)}`}
            >
              <T
                value={{
                  en: "Edit lifecycle event",
                  de: "Lebenszyklusereignis bearbeiten",
                }}
              />
            </a>
          ) : null}
        </div>
        <h1>{title}</h1>
        <p className={styles.lede}>{model.constitution.title}</p>
        <div className={styles.meta}>
          <FormattedDate value={event.eventDate} />
          <span>
            <T
              value={
                event.dateCertainty === "approximate"
                  ? { en: "Approximate date", de: "Ungefähres Datum" }
                  : { en: "Exact date", de: "Genaues Datum" }
              }
            />
          </span>
        </div>
        <section id="event-overview">
          {event.note ? <p className={styles.comment}>{event.note}</p> : null}
          {event.sourceUrl ? (
            <p>
              <a href={event.sourceUrl}>
                <T value={{ en: "Source document", de: "Quelldokument" }} />{" "}
                <ReaderIcon name="external" />
              </a>
            </p>
          ) : null}
          {related ? (
            <p>
              <a
                href={`${model.owner}/versions/${related.currentVersionId ?? related.id}`}
              >
                <T
                  value={{
                    en: "Read constitution text",
                    de: "Verfassungstext lesen",
                  }}
                />{" "}
                · {related.versionLabel} →
              </a>
            </p>
          ) : null}
        </section>
        <LifecycleEvidenceStatus query={query} />
        <MaterialStatus query={query} />
        <section id="event-materials">
          <RecordMaterials
            targetType="lifecycle_material"
            targetId={model.constitution.id}
            scope={event.id}
            editable={model.canPublish}
            returnTo={publicHref + "#event-materials"}
          />
        </section>
      </ConstitutionViewer>
    </FullWidthPage>
  );
}
