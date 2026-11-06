"use client";

import { useTranslation } from "../../components/TranslationProvider";
import { ui, type UiMessage } from "../../../lib/messages";
import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { Button } from "../../components/ui";
import { structureUi as copy } from "../../../lib/structure-workspace";
import {
  StructureWorkspaceTemplate,
  OutlineWorkspace,
  StructureTemplates,
  StructurePreview,
} from "./StructureWorkspaceTemplate";
import type {
  OutlineKindWrite,
  SettingsImpact,
  OrderedNode,
} from "../../../lib/api";
import {
  outlineFromTemplate,
  type ConstitutionTemplate,
} from "../../../lib/constitution-templates";
import { saveOutlineAction, previewOutlineImpactAction } from "./actions";
import { Stack } from "../../components/layout/Layout";
import {
  OutlineCreationHeader,
  OutlineReviewCard,
  OutlineFeedback,
  OutlineSubmitActions,
} from "./OutlineCreationStages";
import {
  exampleOutlineFor,
  explicitLayers,
  outlineValidationError,
  withoutExisting,
  type OutlineLayer as Layer,
} from "./outline-editor-model";

type OutlineEditorProps = {
  constitutionId?: string;
  settingsRevisionId?: string;
  initial: OutlineKindWrite[];
  action?: (formData: FormData) => Promise<string>;
  submitLabel?: UiMessage;
  children?: ReactNode;
  guidedCreation?: boolean;
  sampleRoots?: OrderedNode[];
  documents?: ReactNode;
  history?: ReactNode;
  previous?: { id: string; kinds: OutlineKindWrite[] };
};

/** Controlled outline editing and guided creation retain their existing form, review and impact gates. */
export function OutlineEditor({
  constitutionId,
  settingsRevisionId,
  initial,
  action = saveOutlineAction,
  submitLabel = ui.remainingStatus.saveOutline,
  children,
  guidedCreation = false,
  sampleRoots = [],
  documents,
  history,
  previous,
}: OutlineEditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [view, setView] = useState("structure");
  const [template, setTemplate] = useState<ConstitutionTemplate>("articles");
  const t = useTranslation();
  const [showErrors, setShowErrors] = useState(false);
  const [basicsSummary, setBasicsSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(
    explicitLayers(initial, Boolean(constitutionId)),
  );

  const [impact, setImpact] = useState<SettingsImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [checking, setChecking] = useState(false);

  /** Preview checks do not save and retain redirect, loading and failure precedence. */
  async function checkImpact() {
    if (outlineError) {
      setShowErrors(true);
      return;
    }
    setChecking(true);
    setImpactError(false);
    try {
      const data = new FormData();
      data.set("constitutionId", constitutionId ?? "");
      data.set("outline", JSON.stringify(withoutExisting(layers)));
      const result = await previewOutlineImpactAction(data);
      if ("redirectTo" in result) {
        window.location.assign(result.redirectTo);
        return;
      }
      setImpact(result);
    } catch {
      setImpactError(true);
    } finally {
      setChecking(false);
    }
  }

  function changeLayers(next: Layer[]) {
    setImpact(null);
    setLayers(next);
  }

  const exampleOutline = exampleOutlineFor(layers);
  const validationError = outlineValidationError(layers);
  const outlineError = validationError ? t(validationError) : null;

  /** Selecting a template resets only the unsaved structure and its visible validation state. */
  function chooseTemplate(id: ConstitutionTemplate) {
    setTemplate(id);
    setLayers(explicitLayers(outlineFromTemplate(id), false));
    setShowErrors(false);
    setView("structure");
  }

  /** Back navigation preserves edited levels while clearing visible validation feedback. */
  function back() {
    setStep(step === 3 ? 2 : 1);
    setView("structure");
    setShowErrors(false);
  }

  /** Basic native constraints precede outline validation and review. */
  function advance() {
    if (step === 1) {
      if (!formRef.current?.reportValidity()) return;
      const data = new FormData(formRef.current);
      setBasicsSummary(
        `${data.get("title") || t(ui.remainingStatus.untitledConstitution)} · ${data.get("isoCode") || ""}`,
      );
      setStep(2);
      setView("templates");
      return;
    }
    if (outlineError) {
      setShowErrors(true);
      return;
    }
    setStep(3);
    setView("review");
  }

  /** Creation requires the explicit reviewed submitter; native fields retain their order and values. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (
      guidedCreation &&
      (step !== 3 || submitter?.getAttribute("data-create") !== "true")
    ) {
      if (step !== 3) advance();
      return;
    }
    if (outlineError) {
      setShowErrors(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const destination = await action(new FormData(event.currentTarget));
      window.location.assign(destination);
    } catch {
      setSubmitting(false);
      setSubmitError(true);
    }
  }
  const tabs = structureTasks(
    guidedCreation,
    Boolean(constitutionId),
    Boolean(documents) || guidedCreation,
    Boolean(history || previous),
  );
  function selectTask(next: string) {
    if (guidedCreation && next === "review" && step !== 3) {
      advance();
      return;
    }
    if (guidedCreation && step === 3 && next !== "review") setStep(2);
    setView(next);
  }
  const visible = !guidedCreation || step !== 1;
  return (
    <StructureWorkspaceTemplate
      tabs={visible ? tabs : []}
      active={view}
      onSelect={selectTask}
      primary={
        constitutionId && view !== "review" ? (
          <Button
            type="button"
            variant="primary"
            disabled={checking}
            onClick={() => {
              setView("review");
              void checkImpact();
            }}
          >
            {t(ui.outlineDynamic.previewImpact)}
          </Button>
        ) : null
      }
    >
      <Stack
        as="form"
        elementRef={formRef}
        onSubmit={onSubmit}
        hidden={view === "documents" || view === "history"}
      >
        {constitutionId ? (
          <input type="hidden" name="constitutionId" value={constitutionId} />
        ) : null}
        {settingsRevisionId ? (
          <input
            type="hidden"
            name="settingsRevisionId"
            value={settingsRevisionId}
          />
        ) : null}
        <OutlineCreationHeader
          guidedCreation={guidedCreation}
          step={step}
          basicsSummary={basicsSummary}
          layers={layers}
          serializedOutline={JSON.stringify(withoutExisting(layers))}
          advance={advance}
        >
          {children}
        </OutlineCreationHeader>
        {visible ? (
          <>
            {guidedCreation && view === "templates" ? (
              <StructureTemplates value={template} onChoose={chooseTemplate} />
            ) : null}
            <div hidden={view !== "structure"}>
              <OutlineWorkspace
                layers={layers}
                onChange={changeLayers}
                sampleRoots={sampleRoots}
              />
            </div>
            {view === "preview" ? (
              <StructurePreview layers={layers} sampleRoots={sampleRoots} />
            ) : null}
            <div hidden={view !== "review"}>
              {guidedCreation && step === 3 ? (
                <Stack aria-label={t(ui.accessibility.finalStructureSettings)}>
                  {layers.map((layer, index) => (
                    <OutlineReviewCard
                      key={index}
                      layer={layer}
                      index={index}
                      displayKind={exampleOutline.kinds[index]}
                    />
                  ))}
                </Stack>
              ) : null}
              <OutlineFeedback
                showErrors={showErrors}
                outlineError={outlineError}
                impactError={impactError}
                submitError={submitError}
                impact={impact}
              />
            </div>
            {showErrors && outlineError && view !== "review" ? (
              <p role="alert">{outlineError}</p>
            ) : null}
          </>
        ) : null}
        <div hidden={!visible || (!guidedCreation && view !== "review")}>
          <OutlineSubmitActions
            constitutionId={constitutionId}
            settingsRevisionId={settingsRevisionId}
            guidedCreation={guidedCreation}
            step={step}
            submitting={submitting}
            checking={checking}
            impact={impact}
            submitLabel={submitLabel}
            checkImpact={checkImpact}
            advance={advance}
            back={back}
          />
        </div>
      </Stack>
      <ExtraTasks
        view={view}
        documents={documents}
        history={history}
        previous={previous}
        guidedCreation={guidedCreation}
        onRestore={(kinds) => {
          changeLayers(explicitLayers(kinds, true));
          setView("review");
        }}
      />
    </StructureWorkspaceTemplate>
  );
}

function structureTasks(
  creation: boolean,
  existing: boolean,
  documents: boolean,
  history: boolean,
) {
  return [
    ...(creation ? [{ id: "templates", label: copy.templates }] : []),
    { id: "structure", label: copy.structure },
    { id: "preview", label: copy.preview },
    { id: "review", label: existing ? copy.impact : copy.review },
    ...(documents ? [{ id: "documents", label: copy.documents }] : []),
    ...(history ? [{ id: "history", label: copy.history }] : []),
  ];
}
function ExtraTasks({
  view,
  documents,
  history,
  previous,
  guidedCreation,
  onRestore,
}: Pick<
  OutlineEditorProps,
  "documents" | "history" | "previous" | "guidedCreation"
> & { view: string; onRestore: (kinds: OutlineKindWrite[]) => void }) {
  const t = useTranslation();
  return (
    <>
      {documents || guidedCreation ? (
        <div hidden={view !== "documents"}>
          {documents ?? <p>{t(copy.documentsAfterCreate)}</p>}
        </div>
      ) : null}
      {history || previous ? (
        <div hidden={view !== "history"}>
          {previous ? (
            <Stack>
              <h2>{t(copy.previous)}</h2>
              <p>{t(copy.restoreHelp)}</p>
              <Button type="button" onClick={() => onRestore(previous.kinds)}>
                {t(copy.restoreDraft)}
              </Button>
              <StructurePreview layers={explicitLayers(previous.kinds, true)} />
            </Stack>
          ) : (
            history
          )}
        </div>
      ) : null}
    </>
  );
}
