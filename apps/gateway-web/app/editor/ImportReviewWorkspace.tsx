"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { importReviewUi as copy } from "../../lib/import-review-messages";
import { ui } from "../../lib/messages";
import { useTranslation } from "../components/TranslationProvider";
import { Button, PageHeader } from "../components/ui";
import { ReaderIcon } from "../components/ReaderIcon";
import { WorkspacePage } from "../components/layout/templates";
import {
  PageChromeSurface,
  PageMenuFrame,
  PageMenuBar,
} from "../components/layout/PageChrome";
import { usePageChromeMetrics } from "../components/layout/usePageChromeMetrics";
import styles from "./ImportReviewWorkspace.module.css";

export type ImportReviewTab = "content" | "review" | "history";
export type ImportDisplay = "reading" | "source" | "compare";
type Props = {
  title: string;
  summary?: ReactNode;
  status: ReactNode;
  jobStatus?: string;
  reading: ReactNode;
  source: ReactNode;
  review?: ReactNode;
  history: ReactNode;
  navigation?: ReactNode;
  notice?: ReactNode;
  preparation?: ReactNode;
  initialTab?: ImportReviewTab;
  initialDisplay?: ImportDisplay;
  nextHref?: string;
  canCompare?: boolean;
};

/** One mounted workspace for individual imports, package versions and supporting records. */
export function ImportReviewWorkspace({
  title,
  summary,
  status,
  jobStatus,
  reading,
  source,
  review,
  history,
  navigation,
  notice,
  preparation,
  initialTab = "content",
  initialDisplay = "reading",
  nextHref,
  canCompare = true,
}: Props) {
  const t = useTranslation();
  const [tab, setTab] = useState<ImportReviewTab>(
    initialTab === "review" && !review ? "content" : initialTab,
  );
  const [display, setDisplay] = useState<ImportDisplay>(
    initialDisplay === "compare" && !canCompare ? "reading" : initialDisplay,
  );
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    () => false,
  );
  const [navigationOverride, setExpanded] = useState<boolean | null>(null);
  const expanded = navigationOverride ?? desktop;
  const root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    contents = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, contents);
  const tabs: ImportReviewTab[] = review
    ? ["content", "review", "history"]
    : ["content", "history"];
  const phase =
    jobStatus === "completed"
      ? 3
      : jobStatus === "approved" || jobStatus === "publishing"
        ? 2
        : jobStatus === "prepare"
          ? 0
          : 1;
  function chooseTab(next: ImportReviewTab) {
    setTab(next);
  }
  return (
    <WorkspacePage
      className="import-review"
      header={
        <PageHeader
          title={t(ui.importReview.title)}
          breadcrumbs={[
            { href: "/admin/import", label: t(copy.imports) },
            { label: title },
          ]}
          meta={summary}
        />
      }
    >
      <PageChromeSurface ref={root} className={styles.surface}>
        <PageMenuFrame ref={menu}>
          <PageMenuBar label={t(ui.importReview.title)}>
            {navigation ? (
              <button
                type="button"
                className={styles.tool}
                aria-expanded={expanded}
                aria-controls="import-package-contents"
                onClick={() => setExpanded(!expanded)}
              >
                <ReaderIcon name="contents" />
                {t(expanded ? copy.hidePackage : copy.showPackage)}
              </button>
            ) : null}
            <div
              role="tablist"
              aria-label={t(ui.importReview.title)}
              className={styles.tabs}
            >
              {tabs.map((value, index) => (
                <button
                  type="button"
                  key={value}
                  id={`import-tab-${value}`}
                  role="tab"
                  className={styles.tool}
                  aria-selected={tab === value}
                  aria-controls={`import-panel-${value}`}
                  tabIndex={tab === value ? 0 : -1}
                  onClick={() => chooseTab(value)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (index +
                              (event.key === "ArrowRight"
                                ? 1
                                : tabs.length - 1)) %
                            tabs.length;
                    chooseTab(tabs[next]);
                    document
                      .getElementById(`import-tab-${tabs[next]}`)
                      ?.focus();
                  }}
                >
                  <ReaderIcon
                    name={
                      value === "content"
                        ? "book"
                        : value === "review"
                          ? "check"
                          : "history"
                    }
                  />
                  {t(copy[value])}
                </button>
              ))}
            </div>
          </PageMenuBar>
        </PageMenuFrame>
        <div
          className={styles.layout}
          data-navigation={Boolean(navigation && expanded)}
        >
          {navigation ? (
            <aside
              ref={contents}
              id="import-package-contents"
              className={styles.navigation}
              hidden={!expanded}
            >
              {navigation}
            </aside>
          ) : null}
          <section className={styles.body}>
            {notice}
            <header className={styles.selected}>
              <div className={styles.selectedTop}>
                <div>
                  {status}
                  {jobStatus && jobStatus !== "completed" ? (
                    <span className="muted"> · {t(copy.private)}</span>
                  ) : null}
                  <h2>{title}</h2>
                </div>
                {review &&
                tab !== "review" &&
                jobStatus !== "completed" &&
                jobStatus !== "rejected" ? (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => chooseTab("review")}
                  >
                    {t(jobStatus === "approved" ? copy.publish : copy.decision)}{" "}
                    →
                  </Button>
                ) : null}
                {jobStatus === "completed" && nextHref ? (
                  <Link className="btn btn-primary" href={nextHref}>
                    {t(copy.next)} →
                  </Link>
                ) : null}
              </div>
              {jobStatus ? (
                <ol
                  className={styles.progress}
                  aria-label={t(ui.importReview.title)}
                >
                  {[copy.prepared, copy.review, copy.publication].map(
                    (label, index) => (
                      <li
                        key={label.en}
                        data-state={
                          index < phase
                            ? "done"
                            : index === phase
                              ? "current"
                              : "pending"
                        }
                        aria-current={index === phase ? "step" : undefined}
                      >
                        <span aria-hidden="true">
                          {index < phase ? "✓" : index + 1}
                        </span>
                        {t(label)}
                      </li>
                    ),
                  )}
                </ol>
              ) : null}
              {jobStatus === "pending_review" ? (
                <p className="muted">{t(copy.reviewTask)}</p>
              ) : null}
              {preparation}
            </header>
            <section
              id="import-panel-content"
              role="tabpanel"
              aria-labelledby="import-tab-content"
              hidden={tab !== "content"}
            >
              {review ? (
                <div
                  className={styles.viewOptions}
                  role="group"
                  aria-label={t(copy.display)}
                >
                  {(["reading", "source", "compare"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={display === value}
                      disabled={value === "compare" && !canCompare}
                      onClick={() => setDisplay(value)}
                    >
                      {value === "compare" ? <ReaderIcon name="swap" /> : null}
                      {t(copy[value])}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className={styles.comparison}
                data-display={review ? display : "source"}
              >
                <section
                  className={styles.reading}
                  hidden={Boolean(review && display === "source") || !review}
                >
                  {reading}
                </section>
                <section
                  className={styles.source}
                  hidden={Boolean(review && display === "reading")}
                >
                  {source}
                </section>
              </div>
            </section>
            {review ? (
              <section
                id="import-panel-review"
                role="tabpanel"
                aria-labelledby="import-tab-review"
                hidden={tab !== "review"}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDisplay(canCompare ? "compare" : "source");
                    chooseTab("content");
                  }}
                >
                  {t(copy.compareWording)}
                </Button>
                {review}
              </section>
            ) : null}
            <section
              id="import-panel-history"
              role="tabpanel"
              aria-labelledby="import-tab-history"
              hidden={tab !== "history"}
            >
              {history}
            </section>
          </section>
        </div>
      </PageChromeSurface>
    </WorkspacePage>
  );
}

function desktopSnapshot() {
  return window.matchMedia("(min-width:761px)").matches;
}
function subscribeDesktop(notify: () => void) {
  const media = window.matchMedia("(min-width:761px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
