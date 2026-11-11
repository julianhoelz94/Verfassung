"use client";

import { useState } from "react";
import { ArrowRight, Globe, Pencil } from "lucide-react";
import type { WikiPageRevision } from "../../../lib/api";
import {
  useTranslation,
  useLocale,
} from "../../components/TranslationProvider";

export function WikiRevisionHistory({
  revisions,
  actorId,
  links,
  onInspect,
}: {
  revisions: WikiPageRevision[];
  actorId: string;
  links: { newer?: string; older?: string };
  onInspect: (revision: WikiPageRevision) => void;
}) {
  const t = useTranslation(),
    locale = useLocale(),
    copy = (en: string, de: string) => t({ en, de }),
    [filter, setFilter] = useState("all");
  const visible = revisions
    .slice(0, 25)
    .filter(
      (revision) =>
        filter === "all" ||
        (filter === "published"
          ? Boolean(revision.publishedAt)
          : !revision.publishedAt),
    );
  return (
    <section className="history-view">
      <div className="section-intro">
        <span className="eyebrow">{copy("THE RECORD", "DER VERLAUF")}</span>
        <h2>
          {copy(
            "Every version has a story",
            "Jede Fassung hat eine Geschichte",
          )}
        </h2>
        <p>
          {copy(
            "Saved Wiki drafts and publications, separate from legal version history.",
            "Gespeicherte Wiki-Entwürfe und Veröffentlichungen, getrennt vom Verlauf der Rechtsfassungen.",
          )}
        </p>
      </div>
      <div className="history-toolbar">
        <span>{copy("Saved revisions", "Gespeicherte Revisionen")}</span>
        <label>
          {copy("Show", "Anzeigen")}
          <select
            aria-label={copy(
              "Filter revision history",
              "Revisionsverlauf filtern",
            )}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">
              {copy("All revisions", "Alle Revisionen")}
            </option>
            <option value="published">
              {copy("Published", "Veröffentlicht")}
            </option>
            <option value="draft">{copy("Drafts", "Entwürfe")}</option>
          </select>
        </label>
      </div>
      <ol className="history-list">
        {visible.map((revision) => (
          <li key={revision.id}>
            <span
              className={`timeline-mark ${revision.publishedAt ? "published" : ""}`}
            >
              {revision.publishedAt ? (
                <Globe size={15} />
              ) : (
                <Pencil size={15} />
              )}
            </span>
            <div>
              <div className="history-row-top">
                <strong>
                  {revision.publishedAt
                    ? copy("Published page", "Veröffentlichte Seite")
                    : copy("Saved draft", "Gespeicherter Entwurf")}
                </strong>
              </div>
              <p>{revision.summary}</p>
              <small>
                {revision.createdAt
                  ? new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(revision.createdAt))
                  : copy("Date not recorded", "Datum nicht erfasst")}
                {" · "}
                {revision.createdBy === actorId
                  ? copy("You", "Du")
                  : copy("Editor", "Redaktion")}
              </small>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => onInspect(revision)}
            >
              {copy("View", "Ansehen")}
              <ArrowRight size={15} />
            </button>
          </li>
        ))}
      </ol>
      {!visible.length ? (
        <p>
          {copy(
            "No revisions on this page.",
            "Keine Revisionen auf dieser Seite.",
          )}
        </p>
      ) : null}
      {links.newer || links.older ? (
        <nav
          className="history-pages"
          aria-label={copy(
            "Revision history pages",
            "Seiten des Revisionsverlaufs",
          )}
        >
          {links.newer ? (
            <a href={links.newer}>
              {copy("Newer revisions", "Neuere Revisionen")}
            </a>
          ) : null}
          {links.older ? (
            <a href={links.older}>
              {copy("Older revisions", "Ältere Revisionen")}
            </a>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
