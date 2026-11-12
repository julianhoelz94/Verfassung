import type { ReactNode } from "react";
import { useTranslation } from "../../components/TranslationProvider";
import { ui } from "../../../lib/messages";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import { structureUi as copy } from "../../../lib/structure-workspace";
import { Badge, Button, Card } from "../../components/ui";
import { ReaderIcon } from "../../components/ReaderIcon";
import { Inline, Stack } from "../../components/layout/Layout";
import { StructurePreview } from "./StructureWorkspaceTemplate";
import { OutlineReviewCard } from "./OutlineCreationStages";
import {
  exampleOutlineFor,
  explicitLayers,
  type OutlineLayer,
} from "./outline-editor-model";
import type { OutlineKindWrite } from "../../../lib/api";
import styles from "./ConstitutionWorkspace.module.css";

export function OutlineDraftStatus({
  creation,
  dirty,
}: {
  creation: boolean;
  dirty: boolean;
}) {
  const t = useTranslation();
  return (
    <>
      <Badge tone={dirty ? "changed" : "info"}>
        {t(creation ? m.draft : dirty ? m.unsaved : m.saved)}
      </Badge>
    </>
  );
}
export function CreationSteps({ step }: { step: number }) {
  const t = useTranslation();
  return (
    <nav
      className="creation-steps"
      aria-label={t(ui.accessibility.creationSteps)}
    >
      {[m.details, copy.structure, ui.outlineDynamic.reviewCreate].map(
        (label, index) => (
          <span
            key={label.en}
            aria-current={step === index + 1 ? "step" : undefined}
          >
            {index + 1}. {t(label)}
          </span>
        ),
      )}
    </nav>
  );
}
export function OutlineIdentityPanel({
  children,
  identity,
  title,
  creation,
  existing,
  advance,
}: {
  children?: ReactNode;
  identity?: ReactNode;
  title?: string;
  creation: boolean;
  existing?: ReactNode;
  advance: () => void;
}) {
  const t = useTranslation();
  return (
    <Stack gap="card">
      {children ?? identity ?? (
        <Card>
          <h3>{t(m.identity)}</h3>
          <p>{title ?? t(m.settings)}</p>
          <p className="muted">{t(m.settingsHelp)}</p>
        </Card>
      )}
      {creation ? (
        <Button type="button" variant="primary" onClick={advance}>
          {t(ui.admin.constitutions.outlineeditor.continueToStructure)}
          <ReaderIcon name="right" />
        </Button>
      ) : null}
      {existing ? (
        <details>
          <summary>{t(m.existing)}</summary>
          {existing}
        </details>
      ) : null}
    </Stack>
  );
}
export function OutlineStructurePanel({
  children,
  templates,
  toggleTemplates,
  error,
  next,
}: {
  children: ReactNode;
  templates?: ReactNode;
  toggleTemplates?: ReactNode;
  error: string | null;
  next: ReactNode;
}) {
  const t = useTranslation();
  return (
    <Stack gap="card">
      <div className={styles.sectionIntro}>
        <div>
          <h3>{t(m.hierarchy)}</h3>
          <p className="muted">{t(m.structureHelp)}</p>
        </div>
        {toggleTemplates}
      </div>
      {templates}
      {error ? <p role="alert">{error}</p> : null}
      {children}
      <Inline>{next}</Inline>
    </Stack>
  );
}
export function OutlineReviewPanel({
  creation,
  summary,
  layers,
  children,
}: {
  creation: boolean;
  summary: string;
  layers: OutlineLayer[];
  children: ReactNode;
}) {
  const t = useTranslation(),
    outline = exampleOutlineFor(layers);
  return (
    <Stack gap="card">
      <Card>
        <h3>
          {t(
            creation
              ? ui.admin.constitutions.outlineeditor.reviewBeforeCreating
              : copy.impact,
          )}
        </h3>
        {creation ? <p>{summary}</p> : null}
        <p>{layers.map((layer) => layer.displayLabel).join(" → ")}</p>
        <p className="muted">
          {t(
            creation
              ? ui.admin.constitutions.outlineeditor
                  .theNewConstitutionCanBeEditedAfter
              : m.settingsHelp,
          )}
        </p>
      </Card>
      <details>
        <summary>{t(m.allLevels)}</summary>
        <Stack aria-label={t(ui.accessibility.finalStructureSettings)}>
          {layers.map((layer, index) => (
            <OutlineReviewCard
              key={index}
              layer={layer}
              index={index}
              displayKind={outline.kinds[index]}
            />
          ))}
        </Stack>
      </details>
      {children}
    </Stack>
  );
}
export function OutlineHistoryPanel({
  previous,
  history,
  creation,
  onRestore,
}: {
  previous?: { id: string; kinds: OutlineKindWrite[] };
  history?: ReactNode;
  creation: boolean;
  onRestore: (kinds: OutlineKindWrite[]) => void;
}) {
  const t = useTranslation();
  return (
    <Stack gap="card">
      {previous ? (
        <>
          <h3>{t(copy.previous)}</h3>
          <p>{t(copy.restoreHelp)}</p>
          <Button type="button" onClick={() => onRestore(previous.kinds)}>
            {t(copy.restoreDraft)}
          </Button>
          <StructurePreview layers={explicitLayers(previous.kinds, true)} />
        </>
      ) : (
        (history ?? <p>{t(creation ? m.creationHistory : m.emptyHistory)}</p>)
      )}
    </Stack>
  );
}
