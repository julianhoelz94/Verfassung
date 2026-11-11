"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FullWidthPage,
  PageChromeSurface,
  PageContentsBody,
  PageContentsLayout,
  PageMenuBar,
  PageMenuDivider,
  PageMenuFrame,
} from "../../components/layout/PageChrome";
import { usePageChromeMetrics } from "../../components/layout/usePageChromeMetrics";
import { ReaderIcon, type ReaderIconName } from "../../components/ReaderIcon";
import { useTranslation } from "../../components/TranslationProvider";
import { PageHeader } from "../../components/ui";
import type { UiMessage } from "../../../lib/messages";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import { structureUi } from "../../../lib/structure-workspace";
import styles from "./StructureWorkspaceFrame.module.css";

export type StructureTask = { id: string; label: UiMessage };
export const constitutionTasks: StructureTask[] = [
  { id: "identity", label: m.details },
  { id: "structure", label: structureUi.structure },
  { id: "documents", label: structureUi.documents },
  { id: "review", label: structureUi.review },
  { id: "history", label: structureUi.history },
];
type Props = {
  header?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  context?: ReactNode;
  navigation: ReactNode;
  tabs: StructureTask[];
  active: string;
  onSelect: (view: string) => void | boolean;
  primary?: ReactNode;
  children: ReactNode;
};
const icons: Record<string, ReaderIconName> = {
  identity: "details",
  structure: "settings",
  documents: "link",
  review: "check",
  history: "history",
};

/** Shared chrome for creation, saved settings and import proposal review. */
export function StructureWorkspaceFrame({
  header,
  title,
  status,
  context,
  navigation,
  tabs,
  active,
  onSelect,
  primary,
  children,
}: Props) {
  const t = useTranslation(),
    root = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    contents = useRef<HTMLElement>(null);
  usePageChromeMetrics(root, menu, contents);
  const desktop = useSyncExternalStore(
    subscribeViewport,
    desktopViewport,
    () => false,
  );
  const [override, setOverride] = useState<boolean>();
  const expanded = override ?? desktop;
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextTab(event.key, index, tabs.length);
    if (next === null) return;
    event.preventDefault();
    if (onSelect(tabs[next].id) !== false)
      document.getElementById(`structure-tab-${tabs[next].id}`)?.focus();
  }
  return (
    <FullWidthPage template="workspace">
      <PageChromeSurface ref={root}>
        <div className={styles.header}>
          {header ?? <PageHeader separator={false} title={t(m.title)} />}
        </div>
        <PageMenuFrame ref={menu}>
          <PageMenuBar compact role="toolbar" label={t(m.title)}>
            <button
              type="button"
              className={styles.tool}
              aria-label={t(expanded ? m.hide : m.show)}
              title={t(expanded ? m.hide : m.show)}
              aria-expanded={expanded}
              aria-controls="structure-contents"
              onClick={() => setOverride(!expanded)}
            >
              <ReaderIcon name="contents" />
              <span className={styles.toolLabel}>{t(m.overview)}</span>
            </button>
            <PageMenuDivider />
            <div role="tablist" aria-label={t(m.title)} className={styles.tabs}>
              {tabs.map((tab, index) => (
                <button
                  type="button"
                  key={tab.id}
                  id={`structure-tab-${tab.id}`}
                  role="tab"
                  aria-controls={`structure-panel-${tab.id}`}
                  aria-label={t(tab.label)}
                  title={t(tab.label)}
                  aria-selected={active === tab.id}
                  tabIndex={active === tab.id ? 0 : -1}
                  className={styles.tool}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => keyboard(event, index)}
                >
                  <ReaderIcon name={icons[tab.id] ?? "details"} />
                  <span className={styles.toolLabel}>{t(tab.label)}</span>
                </button>
              ))}
            </div>
          </PageMenuBar>
        </PageMenuFrame>
        <PageContentsLayout
          navigationId="structure-contents"
          navigationRef={contents}
          expanded={expanded}
          navigation={
            <div className={styles.contents}>
              {context ? <div className={styles.context}>{context}</div> : null}
              {navigation}
            </div>
          }
        >
          <PageContentsBody className={styles.body}>
            <div className={styles.selected}>
              <div>
                {status ? <div className={styles.status}>{status}</div> : null}
                <h2>{title}</h2>
              </div>
              {primary}
            </div>
            {children}
          </PageContentsBody>
        </PageContentsLayout>
      </PageChromeSurface>
    </FullWidthPage>
  );
}
export function StructurePanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`structure-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`structure-tab-${id}`}
      hidden={active !== id}
    >
      {children}
    </section>
  );
}
function nextTab(key: string, index: number, count: number) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index + count - 1) % count;
  return null;
}
function desktopViewport() {
  return window.innerWidth > 680;
}
function subscribeViewport(notify: () => void) {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
}
