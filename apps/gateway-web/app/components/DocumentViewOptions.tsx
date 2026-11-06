"use client";

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  readReaderPreferences,
  type ReaderPreferences,
} from "../../lib/reader";
import {
  readerPreferenceSnapshot,
  serverReaderPreferenceSnapshot,
  subscribeReaderPreferences,
  saveReaderPreferences,
  type PreferenceScope,
} from "../../lib/reader-preferences";
import { ConstitutionDocument } from "./ConstitutionDocument";
import { useTranslation } from "./TranslationProvider";
import styles from "./DocumentViewOptions.module.css";

const copy = {
  view: { en: "Display", de: "Darstellung" },
  indent: { en: "Show indentation", de: "Einrückung anzeigen" },
  guides: { en: "Show hierarchy guides", de: "Hierarchielinien anzeigen" },
};
type HierarchyPreferences = Pick<ReaderPreferences, "indentation" | "guides">;

export function HierarchyViewOptions({
  value,
  onChange,
}: {
  value: HierarchyPreferences;
  onChange: (patch: Partial<HierarchyPreferences>) => void;
}) {
  const t = useTranslation();
  return (
    <div className={styles.options}>
      <label>
        <input
          type="checkbox"
          checked={value.indentation}
          onChange={(event) => onChange({ indentation: event.target.checked })}
        />
        {t(copy.indent)}
      </label>
      {value.indentation ? (
        <label>
          <input
            type="checkbox"
            checked={value.guides}
            onChange={(event) => onChange({ guides: event.target.checked })}
          />
          {t(copy.guides)}
        </label>
      ) : null}
    </div>
  );
}

/** Editor working preferences are independent; Preview uses the public reader's store. */
export function DocumentView({
  scope,
  className,
  children,
  controls = true,
}: {
  controls?: boolean;
  scope: PreferenceScope;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslation();
  const snapshot = useCallback(() => readerPreferenceSnapshot(scope), [scope]);
  const stored = useSyncExternalStore(
    subscribeReaderPreferences,
    snapshot,
    serverReaderPreferenceSnapshot,
  );
  const preferences = useMemo(() => {
    try {
      return readReaderPreferences(JSON.parse(stored));
    } catch {
      return readReaderPreferences(null);
    }
  }, [stored]);
  return (
    <div className={className}>
      {controls ? (
        <details className={styles.menu}>
          <summary>{t(copy.view)}</summary>
          <HierarchyViewOptions
            value={preferences}
            onChange={(patch) =>
              saveReaderPreferences({ ...preferences, ...patch }, scope)
            }
          />
        </details>
      ) : null}
      <ConstitutionDocument
        indentation={preferences.indentation}
        guides={preferences.guides}
      >
        {children}
      </ConstitutionDocument>
    </div>
  );
}
