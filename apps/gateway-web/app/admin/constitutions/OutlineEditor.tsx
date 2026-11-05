"use client";

import { T, useTranslation } from "../../components/TranslationProvider";
import { ui, type UiMessage } from "../../../lib/messages";
import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { Button } from "../../components/ui";
import { SettingInfo } from "../../components/SettingInfo";
import type {
  OutlineKindWrite,
  SettingsImpact,
  OrderedNode,
} from "../../../lib/api";
import { outlineExample } from "../../../lib/outline-preview";
import { OutlineReaderPreview } from "./OutlineReaderPreview";
import {
  outlineFromTemplate,
  type ConstitutionTemplate,
} from "../../../lib/constitution-templates";
import { saveOutlineAction, previewOutlineImpactAction } from "./actions";
import { Stack, Inline } from "../../components/layout/Layout";
import surfaceStyles from "../../components/surfaces.module.css";
import { OutlineLayerEditor } from "./OutlineLayerEditor";
import {
  OutlineCreationHeader,
  OutlineReviewCard,
  OutlineFeedback,
  OutlineSubmitActions,
} from "./OutlineCreationStages";
import {
  appendOutlineLayer,
  appendOutlineRoot,
  exampleOutlineFor,
  explicitLayers,
  outlineValidationError,
  removeOutlineLayer,
  updateOutlineLayers,
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
}: OutlineEditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState<ConstitutionTemplate>("sentences");
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

  /** Any settings edit invalidates its previous impact result. */
  function update(index: number, patch: Partial<Layer>) {
    setImpact(null);
    setLayers((current) => updateOutlineLayers(current, index, patch));
  }

  /** Adding a deeper level preserves the terminal sentence convention. */
  function addLayer() {
    setImpact(null);
    setLayers((current) =>
      appendOutlineLayer(current, t(ui.remainingStatus.newLayer)),
    );
  }

  /** Adds an independently rooted unsaved level. */
  function addRootKind() {
    setImpact(null);
    setLayers((current) =>
      appendOutlineRoot(current, t(ui.remainingStatus.newSection)),
    );
  }

  /** The last remaining level cannot be removed. */
  function removeLayer(index: number) {
    if (layers.length === 1) {
      return;
    }
    setImpact(null);
    setLayers((current) => removeOutlineLayer(current, index));
  }

  const exampleOutline = exampleOutlineFor(layers);
  const example = outlineExample(exampleOutline, t);
  const validationError = outlineValidationError(layers);
  const outlineError = validationError ? t(validationError) : null;

  /** Selecting a template resets only the unsaved structure and its visible validation state. */
  function chooseTemplate(id: ConstitutionTemplate) {
    setTemplate(id);
    setLayers(explicitLayers(outlineFromTemplate(id), false));
    setShowErrors(false);
  }

  /** Back navigation preserves edited levels while clearing visible validation feedback. */
  function back() {
    setStep(step === 3 ? 2 : 1);
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
      return;
    }
    if (outlineError) {
      setShowErrors(true);
      return;
    }
    setStep(3);
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
  return (
    <Stack as="form" elementRef={formRef} onSubmit={onSubmit}>
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
        template={template}
        basicsSummary={basicsSummary}
        layers={layers}
        serializedOutline={JSON.stringify(withoutExisting(layers))}
        advance={advance}
        chooseTemplate={chooseTemplate}
      >
        {children}
      </OutlineCreationHeader>
      <div
        className="outline-config-layout"
        hidden={guidedCreation && step === 1}
      >
        <Stack>
          {guidedCreation && step === 3 ? (
            <Stack aria-label={t(ui.accessibility.finalStructureSettings)}>
              {layers.map((layer, index) => (
                <OutlineReviewCard
                  key={`${layer.kindCode}-${index}`}
                  layer={layer}
                  index={index}
                  displayKind={exampleOutline.kinds[index]!}
                />
              ))}
            </Stack>
          ) : (
            <Stack as="ol" className="outline-layer-list" role="list">
              {layers.map((layer, index) => (
                <OutlineLayerEditor
                  key={`${layer.kindCode}-${index}`}
                  layer={layer}
                  index={index}
                  layers={layers}
                  update={update}
                  removeLayer={removeLayer}
                />
              ))}
            </Stack>
          )}
          {!guidedCreation || step === 2 ? (
            <Stack gap="related" className="outline-structure-actions">
              <Inline>
                <Inline as="span" gap="related">
                  <Button type="button" onClick={addLayer}>
                    <T
                      value={
                        ui.admin.constitutions.outlineeditor.addDeeperLayer
                      }
                    />
                  </Button>
                  <SettingInfo
                    label={
                      <T
                        value={
                          ui.admin.constitutions.outlineeditor.addDeeperLayer
                        }
                      />
                    }
                    description={<T value={ui.help.addDeeperLevelHelp} />}
                    changeability="review"
                  />
                </Inline>
                <Button type="button" onClick={addRootKind}>
                  <T
                    value={ui.admin.constitutions.outlineeditor.addTopLevelKind}
                  />
                </Button>
              </Inline>
              {layers[layers.length - 1]?.kindCode === "sentence" ? (
                <p className="muted">
                  <T
                    value={
                      ui.admin.constitutions.outlineeditor
                        .newLevelsAreAddedBeforeTheFinal
                    }
                  />
                </p>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
        <aside
          className={["card outline-live-preview", surfaceStyles.card].join(
            " ",
          )}
          aria-label={t(ui.admin.constitutions.outlineeditor.readerPreview)}
        >
          <h2>
            <T value={ui.admin.constitutions.outlineeditor.readerPreview} />
          </h2>
          <p className="muted">
            <T value={ui.outlinePreview.inspectHelp} />
          </p>
          {sampleRoots.length ? (
            <p className="muted">
              <T value={ui.outlinePreview.sourceSample} />
            </p>
          ) : null}
          <OutlineReaderPreview
            roots={sampleRoots.length ? sampleRoots : example}
            outline={exampleOutline}
          />
          {constitutionId ? (
            <p>
              <T
                value={
                  ui.admin.constitutions.outlineeditor
                    .occupiedStructureAndStricterPermissionsAreChecked
                }
              />
            </p>
          ) : null}
        </aside>
      </div>
      <OutlineFeedback
        showErrors={showErrors}
        outlineError={outlineError}
        impactError={impactError}
        submitError={submitError}
        impact={impact}
      />
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
    </Stack>
  );
}
