import { cache } from "react";
import {
  listDocumentLinks,
  type DocumentLink,
  type DocumentTarget,
} from "../../../lib/document-api";
import type { PassageProvenance } from "../../../lib/consolidated-comparison";
import { T } from "../TranslationProvider";

const publicLinks = cache(
  (type: DocumentTarget, id: string, scope?: string | null) =>
    listDocumentLinks(type, id, scope),
);

export async function ComparisonEvidence({
  provenance,
}: {
  provenance: PassageProvenance[];
}) {
  const acts = [
    ...new Map(provenance.map((p) => [p.amendment.id, p.amendment])).values(),
  ];
  const loaded = await Promise.all([
    ...acts.flatMap((a) =>
      [
        publicLinks("amendment", a.id, a.publishedRevisionId),
        publicLinks("amendment_material", a.id),
      ].map((p) =>
        p.then((links) => ({ title: a.title, links })).catch(() => null),
      ),
    ),
    ...provenance.map((p) =>
      publicLinks("change_material", p.amendment.id, p.change.id)
        .then((links) => ({ title: p.amendment.title, links }))
        .catch(() => null),
    ),
  ]);
  const documents = new Map<
    string,
    { link: DocumentLink; titles: Set<string> }
  >();
  for (const result of loaded)
    for (const link of result?.links ?? []) {
      const key = link.documentId + ":" + link.document.revision.id,
        current = documents.get(key) ?? { link, titles: new Set<string>() };
      current.titles.add(result!.title);
      documents.set(key, current);
    }
  const sources = new Map<string, { label: string; titles: Set<string> }>();
  for (const act of acts)
    for (const source of act.documents ?? [])
      if (source.url && /^https?:\/\//.test(source.url)) {
        const entry = sources.get(source.url) ?? {
          label: source.label || source.url,
          titles: new Set<string>(),
        };
        entry.titles.add(act.title);
        sources.set(source.url, entry);
      }
  return (
    <>
      {documents.size ? (
        <section>
          <h3>
            <T
              value={{
                en: "Commentary & materials",
                de: "Kommentare & Materialien",
              }}
            />
          </h3>
          {[...documents].map(([key, { link, titles }]) => (
            <article key={key}>
              <h4>{link.document.revision.title}</h4>
              <p>{link.document.revision.description}</p>
              <small>{[...titles].join(" · ")}</small>
              {link.document.revision.sourceUrl ? (
                <p>
                  <a href={link.document.revision.sourceUrl}>
                    <T value={{ en: "Open source", de: "Quelle öffnen" }} />
                  </a>
                </p>
              ) : null}
              {link.document.revision.fileName ? (
                <p>
                  <a
                    href={`/documents/${link.documentId}?revision=${link.document.revision.revision}`}
                  >
                    {link.document.revision.fileName}
                  </a>
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
      {sources.size ? (
        <ul>
          {[...sources].map(([url, source]) => (
            <li key={url}>
              <a href={url}>{source.label}</a> ·{" "}
              {[...source.titles].join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
      {loaded.some((result) => result === null) ? (
        <p role="status">
          <T
            value={{
              en: "Some supporting materials could not be loaded.",
              de: "Ein Teil der Begleitmaterialien konnte nicht geladen werden.",
            }}
          />
        </p>
      ) : null}
    </>
  );
}
