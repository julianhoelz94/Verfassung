import type { ReactNode } from "react";
import { useTranslation } from "../../components/TranslationProvider";
import { Button } from "../../components/ui";
import { ReaderIcon } from "../../components/ReaderIcon";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import { structureUi } from "../../../lib/structure-workspace";
import {
  outlineBranches,
  type OutlineBranch,
  type OutlineLayer,
} from "./outline-editor-model";
import styles from "./ConstitutionWorkspace.module.css";

/** Show each allowed path, including separate roots and disconnected levels. */
export function StructureOverview({
  layers,
  onInspect,
  children,
}: {
  layers: OutlineLayer[];
  onInspect: () => void;
  children?: ReactNode;
}) {
  const t = useTranslation();
  const paths = overviewPaths(outlineBranches(layers), layers);
  return (
    <section>
      <div className={styles.sectionIntro}>
        <h3>{t(m.atAGlance)}</h3>
        <Button type="button" variant="ghost" onClick={onInspect}>
          {t(m.inspectStructure)}
          <ReaderIcon name="right" />
        </Button>
      </div>
      <ul className={styles.hierarchyStrip}>
        {paths.map((path, index) => (
          <li key={index}>
            {path.labels.map((label, position) => (
              <span key={position}>
                {position ? <ReaderIcon name="right" /> : null}
                {label}
              </span>
            ))}
            {path.disconnected ? (
              <small>{t(structureUi.disconnected)}</small>
            ) : null}
          </li>
        ))}
      </ul>
      {children ? <div className={styles.excerpt}>{children}</div> : null}
    </section>
  );
}
function overviewPaths(
  branches: OutlineBranch[],
  layers: OutlineLayer[],
  prefix: string[] = [],
  disconnected = false,
): { labels: string[]; disconnected: boolean }[] {
  return branches.flatMap((branch) => {
    const labels = [...prefix, layers[branch.index].displayLabel];
    const warning = disconnected || Boolean(branch.unplaced);
    return branch.children.length
      ? overviewPaths(branch.children, layers, labels, warning)
      : [{ labels, disconnected: warning }];
  });
}
