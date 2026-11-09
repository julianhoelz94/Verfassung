import { ReaderIcon } from "../ReaderIcon";
import type { AmendmentChange } from "../../../lib/api";
import { diffText } from "../../../lib/text-diff";
import { T } from "../TranslationProvider";
import styles from "./ConstitutionHistory.module.css";

export function PassageChange({
  change,
  compact = false,
}: {
  change: AmendmentChange;
  compact?: boolean;
}) {
  const complete = [change.beforeRef, change.afterRef].every(
    (ref) => !ref || ref.text != null,
  );
  const segments = complete
    ? diffText(change.beforeRef?.text ?? "", change.afterRef?.text ?? "")
    : [];
  return (
    <section className={styles.change} id={"change-" + change.id}>
      {!compact ? (
        <>
          <p className={styles.eyebrow}>{change.changeType}</p>
          <h2>
            {[
              ...(change.afterRef?.breadcrumbs ??
                change.beforeRef?.breadcrumbs ??
                []),
              change.afterRef?.label ??
                change.beforeRef?.label ??
                change.articleNumber,
            ]
              .filter(Boolean)
              .join(" › ")}
          </h2>
        </>
      ) : null}
      {(!change.beforeRef && !change.afterRef) ||
      change.legacyLinkUnresolved ||
      change.linkReviewReason ? (
        <p role="status">
          <T
            value={{
              en: "The exact passage mapping is unavailable. Any available wording is shown below.",
              de: "Die genaue Passagenzuordnung ist nicht verfügbar. Verfügbarer Wortlaut steht unten.",
            }}
          />
        </p>
      ) : null}
      {change.beforeRef || change.afterRef ? (
        <div className={styles.columns}>
          {(["before", "after"] as const).map((side) => (
            <section key={side} data-passage-side={side}>
              <p className={styles.eyebrow}>
                <T
                  value={
                    side === "before"
                      ? { en: "Before", de: "Vorher" }
                      : { en: "After", de: "Nachher" }
                  }
                />
                {(side === "before" ? change.beforeRef : change.afterRef)
                  ?.deepLink ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={
                        (side === "before"
                          ? change.beforeRef
                          : change.afterRef)!.deepLink!
                      }
                    >
                      <T value={{ en: "Open passage", de: "Passage öffnen" }} />{" "}
                      <ReaderIcon name="external" />
                    </a>
                  </>
                ) : null}
              </p>
              <div className={styles.words}>
                {!complete &&
                  (side === "before" ? change.beforeRef : change.afterRef)
                    ?.text}
                {(side === "before" ? change.beforeRef : change.afterRef) &&
                (side === "before" ? change.beforeRef : change.afterRef)
                  ?.text == null ? (
                  <p role="status">
                    <T
                      value={{
                        en: "Passage text is temporarily unavailable.",
                        de: "Der Passagentext ist vorübergehend nicht verfügbar.",
                      }}
                    />
                  </p>
                ) : null}
                {segments
                  .filter((s) =>
                    side === "before" ? s.type !== "add" : s.type !== "remove",
                  )
                  .map((s, i) =>
                    s.type === "remove" ? (
                      <del key={i}>{s.text}</del>
                    ) : s.type === "add" ? (
                      <ins key={i}>{s.text}</ins>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                {!(side === "before" ? change.beforeRef : change.afterRef) ? (
                  <T value={{ en: "Not present", de: "Nicht vorhanden" }} />
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {change.note ? <p className={styles.comment}>{change.note}</p> : null}
    </section>
  );
}
