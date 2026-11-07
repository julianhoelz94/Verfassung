"use client";
import { ReadingPreferenceControls } from "../DocumentViewOptions";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  PageBreadcrumbs,
  PageChromeSurface,
  PageContentsBody,
  PageContentsLayout,
  PageMenuBar,
  PageMenuFrame,
} from "../layout/PageChrome";
import { usePageChromeMetrics } from "../layout/usePageChromeMetrics";
import { ReaderIcon } from "../ReaderIcon";
import { useTranslation } from "../TranslationProvider";
import {
  readReaderPreferences,
  type ReaderPreferences,
} from "../../../lib/reader";
import {
  readerPreferenceSnapshot,
  serverReaderPreferenceSnapshot,
  subscribeReaderPreferences,
  saveReaderPreferences,
} from "../../../lib/reader-preferences";
import styles from "./ConstitutionHistory.module.css";

/** Common document navigation for History and every record/comparison viewer. */
export function ConstitutionViewer({
  breadcrumbs,
  mode,
  readHref,
  historyHref,
  wiki,
  details,
  navigation,
  children,
  initialPanel,
}: {
  breadcrumbs: ReactNode;
  mode: "read" | "history" | "compare";
  readHref?: string;
  historyHref: string;
  wiki?: ReactNode;
  details?: ReactNode;
  initialPanel?: "wiki";
  navigation: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslation();
  const snapshot = useSyncExternalStore(
    subscribeReaderPreferences,
    readerPreferenceSnapshot,
    serverReaderPreferenceSnapshot,
  );
  const preferences = useMemo(() => {
    try {
      return readReaderPreferences(JSON.parse(snapshot));
    } catch {
      return readReaderPreferences(null);
    }
  }, [snapshot]);
  const contents = preferences.navigation;
  const [panel, setPanel] = useState<"wiki" | "details" | "preferences" | null>(
    initialPanel ?? null,
  );
  const surface = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    nav = useRef<HTMLElement>(null);
  usePageChromeMetrics(surface, menu, nav);
  useEffect(() => {
    if (!panel) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanel(null);
        surface.current
          ?.querySelector<HTMLElement>('[data-viewer-trigger="' + panel + '"]')
          ?.focus();
      }
    }
    function outside(event: PointerEvent) {
      if (panel !== "preferences") return;
      const root = surface.current;
      const target = event.target as Node;
      if (!root?.querySelector("#constitution-preferences")?.contains(target) &&
          !root?.querySelector('[data-viewer-trigger="preferences"]')?.contains(target))
        setPanel(null);
    }
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [panel]);
  return (
    <PageChromeSurface
      ref={surface}
      className={styles.viewer}
      data-viewer-mode={mode}
      style={
        {
          "--constitution-font-size": preferences.size + "px",
        } as React.CSSProperties
      }
    >
      <PageBreadcrumbs>{breadcrumbs}</PageBreadcrumbs>
      <PageMenuFrame ref={menu}>
        <PageMenuBar
          className={styles.menu}
          as="nav"
          label={t({ en: "Constitution viewer", de: "Verfassungsansicht" })}
        >
          <button
            className={styles.tool}
            aria-expanded={contents}
            aria-controls="constitution-contents"
            onClick={() =>
              saveReaderPreferences({ ...preferences, navigation: !contents })
            }
          >
            <ReaderIcon name="contents" />
            {t({ en: "Contents", de: "Inhalt" })}
          </button>
          <a
            className={styles.tool}
            href={mode === "compare" ? "#comparison" : readHref}
            aria-current={mode !== "history" && !panel ? "page" : undefined}
          >
            <ReaderIcon name={mode === "compare" ? "compare" : "book"} />
            {t(
              mode === "compare"
                ? { en: "Compare", de: "Vergleich" }
                : { en: "Read", de: "Lesen" },
            )}
          </a>
          <button
            className={styles.tool}
            data-viewer-trigger="wiki"
            aria-expanded={panel === "wiki"}
            aria-controls="constitution-wiki"
            onClick={() => setPanel(panel === "wiki" ? null : "wiki")}
          >
            <ReaderIcon name="wiki" />
            Wiki
          </button>
          <a
            className={styles.tool}
            href={historyHref}
            aria-current={mode === "history" && !panel ? "page" : undefined}
          >
            <ReaderIcon name="history" />
            {t({ en: "History", de: "Geschichte" })}
          </a>
          <span className={styles.spacer} />
          <button
            className={styles.tool}
            aria-label={t({ en: "Details", de: "Details" })}
            data-viewer-trigger="details"
            aria-expanded={panel === "details"}
            aria-controls="constitution-details"
            onClick={() => setPanel(panel === "details" ? null : "details")}
          >
            <ReaderIcon name="details" />
            <span className={styles.detailLabel}>
              {t({ en: "Details", de: "Details" })}
            </span>
          </button>
          <button
            className={styles.tool}
            data-viewer-trigger="preferences"
            aria-label={t({
              en: "Reading preferences",
              de: "Leseeinstellungen",
            })}
            aria-expanded={panel === "preferences"}
            aria-controls="constitution-preferences"
            onClick={() =>
              setPanel(panel === "preferences" ? null : "preferences")
            }
          >
            <ReaderIcon name="settings" />
          </button>
        </PageMenuBar>
      </PageMenuFrame>
      {panel ? (
        <section
          className={`${styles.panel} ${panel === "preferences" ? styles.preferencePanel : ""}`}
          id={"constitution-" + panel}
          aria-label={
            panel === "wiki"
              ? "Wiki"
              : panel === "details"
                ? t({ en: "Details", de: "Details" })
                : t({ en: "Reading preferences", de: "Leseeinstellungen" })
          }
        >
          <button
            className={styles.close}
            aria-label={t({ en: "Close panel", de: "Bereich schließen" })}
            onClick={() => setPanel(null)}
          >
            <ReaderIcon name="close" />
          </button>
          {panel === "wiki" ? (
            <>
              <h2>
                {t({
                  en: "About this constitution",
                  de: "Über diese Verfassung",
                })}
              </h2>
              {wiki ?? (
                <p>
                  {t({
                    en: "No Wiki article has been published yet.",
                    de: "Es wurde noch kein Wiki-Artikel veröffentlicht.",
                  })}
                </p>
              )}
            </>
          ) : panel === "preferences" ? (
            <ReadingPreferences
              preferences={preferences}
              hierarchy={mode === "compare"}
            />
          ) : (
            details
          )}
        </section>
      ) : null}
      <PageContentsLayout
        navigationId="constitution-contents"
        navigationRef={nav}
        expanded={contents}
        navigation={navigation}
      >
        <PageContentsBody className={styles.body}>{children}</PageContentsBody>
      </PageContentsLayout>
    </PageChromeSurface>
  );
}

function ReadingPreferences({
  preferences,
  hierarchy,
}: {
  preferences: ReaderPreferences;
  hierarchy: boolean;
}) {
  return (
    <ReadingPreferenceControls
      value={preferences}
      hierarchy={hierarchy}
      onChange={(patch) => saveReaderPreferences({ ...preferences, ...patch })}
    />
  );
}
