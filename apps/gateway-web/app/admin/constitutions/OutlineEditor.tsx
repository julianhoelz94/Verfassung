"use client";

import { useTranslation } from "../../components/TranslationProvider";
import { ui, type UiMessage } from "../../../lib/messages";
import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { Button } from "../../components/ui";
import { ReaderIcon } from "../../components/ReaderIcon";
import { structureUi as copy } from "../../../lib/structure-workspace";
import { constitutionWorkspaceUi as m } from "../../../lib/constitution-workspace-messages";
import {
  StructureWorkspaceTemplate,
  OutlineWorkspace,
  StructureTemplates,
  StructurePanel,
} from "./StructureWorkspaceTemplate";
import { constitutionTasks } from "./StructureWorkspaceFrame";
import { StructureOverview } from "./StructureOverview";
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
import { OutlineFeedback, OutlineSubmitActions } from "./OutlineCreationStages";
import {
  explicitLayers,
  outlineValidationError,
  withoutExisting,
  type OutlineLayer as Layer,
} from "./outline-editor-model";
import {
  OutlineDraftStatus,
  CreationSteps,
  OutlineIdentityPanel,
  OutlineStructurePanel,
  OutlineReviewPanel,
  OutlineHistoryPanel,
} from "./OutlineEditorPanels";

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
  header?: ReactNode;
  title?: string;
  context?: ReactNode;
  identity?: ReactNode;
  notices?: ReactNode;
  existing?: ReactNode;
};

/** Workflow commands stay here; the same frame and selected-level editor serve every owner. */
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
  header,
  title,
  context,
  identity,
  notices,
  existing,
}: OutlineEditorProps) {
  const t = useTranslation(),
    formRef = useRef<HTMLFormElement>(null),
    impactRequest = useRef(0);
  const [view, setView] = useState(guidedCreation ? "identity" : "structure");
  const [template, setTemplate] = useState<ConstitutionTemplate>("articles"),
    [templates, setTemplates] = useState(false);
  const [showErrors, setShowErrors] = useState(false),
    [basicsSummary, setBasicsSummary] = useState("");
  const [draftIdentity, setDraftIdentity] = useState({ title: "", owner: "" }),
    [submitting, setSubmitting] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(() =>
    explicitLayers(initial, Boolean(constitutionId)),
  );
  const [impact, setImpact] = useState<SettingsImpact | null>(null),
    [impactError, setImpactError] = useState(false);
  const [submitError, setSubmitError] = useState(false),
    [checking, setChecking] = useState(false);
  const validationError = outlineValidationError(layers);
  const outlineError = validationError ? t(validationError) : null;
  const dirty =
    JSON.stringify(withoutExisting(layers)) !==
    JSON.stringify(
      withoutExisting(explicitLayers(initial, Boolean(constitutionId))),
    );

  /** Ignore an older check when editing or restoring a draft has invalidated its inputs. */
  async function checkImpact() {
    if (outlineError) {
      setShowErrors(true);
      return;
    }
    const request = ++impactRequest.current;
    setChecking(true);
    setImpactError(false);
    setImpact(null);
    try {
      const data = new FormData();
      data.set("constitutionId", constitutionId ?? "");
      data.set("outline", JSON.stringify(withoutExisting(layers)));
      const result = await previewOutlineImpactAction(data);
      if (request !== impactRequest.current) return;
      if ("redirectTo" in result) {
        window.location.assign(result.redirectTo);
        return;
      }
      setImpact(result);
    } catch {
      if (request === impactRequest.current) setImpactError(true);
    } finally {
      if (request === impactRequest.current) setChecking(false);
    }
  }
  function changeLayers(next: Layer[]) {
    impactRequest.current++;
    setImpact(null);
    setChecking(false);
    setImpactError(false);
    setLayers(next);
  }
  function chooseTemplate(id: ConstitutionTemplate) {
    setTemplate(id);
    changeLayers(explicitLayers(outlineFromTemplate(id), false));
    setShowErrors(false);
    setTemplates(false);
  }
  function readBasics() {
    if (!guidedCreation || !formRef.current) return;
    const data = new FormData(formRef.current);
    const country = formRef.current.querySelector<HTMLSelectElement>(
      '[name="countryChoice"]',
    );
    const owner =
      data.get("countryChoice") === "__new__"
        ? `${data.get("countryName") || ""} (${data.get("isoCode") || ""})`
        : (country?.selectedOptions[0]?.textContent ?? "");
    setDraftIdentity({ title: String(data.get("title") ?? ""), owner });
  }
  function validBasics() {
    const form = formRef.current;
    if (!form) return false;
    if (!form.checkValidity()) {
      setView("identity");
      requestAnimationFrame(() => form.reportValidity());
      return false;
    }
    const data = new FormData(form);
    setBasicsSummary(
      `${data.get("title") || t(ui.remainingStatus.untitledConstitution)} · ${data.get("isoCode") || ""}`,
    );
    return true;
  }
  function review() {
    if (guidedCreation && !validBasics()) return false;
    if (outlineError) {
      setShowErrors(true);
      setView("structure");
      return false;
    }
    setView("review");
    return true;
  }
  function selectTask(next: string) {
    if (next === "review") return review();
    setView(next);
  }
  function advance() {
    if (view === "identity") {
      if (!validBasics()) return;
      setView("structure");
      setTemplates(true);
    } else review();
  }
  function primary() {
    if (review() && constitutionId) void checkImpact();
  }
  /** An implicit Enter can advance creation, but only its explicit reviewed button can create. */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (
      guidedCreation &&
      (view !== "review" || submitter?.getAttribute("data-create") !== "true")
    ) {
      if (view !== "review") advance();
      return;
    }
    if (outlineError) {
      setShowErrors(true);
      setView("structure");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      window.location.assign(await action(new FormData(event.currentTarget)));
    } catch {
      setSubmitting(false);
      setSubmitError(true);
    }
  }
  const step = view === "identity" ? 1 : view === "review" ? 3 : 2;
  return (
    <OutlineWorkspace
      layers={layers}
      onChange={changeLayers}
      sampleRoots={sampleRoots}
      onNavigate={() => setView("structure")}
    >
      {({ navigation, content }) => (
        <StructureWorkspaceTemplate
          header={header}
          title={draftIdentity.title || title || t(m.newConstitution)}
          context={
            context ?? (
              <p>
                {draftIdentity.owner ||
                  t(guidedCreation ? m.create : m.settings)}
              </p>
            )
          }
          navigation={navigation}
          tabs={constitutionTasks}
          active={view}
          onSelect={selectTask}
          status={
            <OutlineDraftStatus creation={guidedCreation} dirty={dirty} />
          }
          primary={
            view !== "review" ? (
              <Button
                type="button"
                onClick={primary}
                disabled={submitting || checking}
              >
                {t(constitutionId ? copy.impact : m.review)}
                <ReaderIcon name="right" />
              </Button>
            ) : null
          }
        >
          {notices}
          {guidedCreation ? <CreationSteps step={step} /> : null}
          <Stack
            as="form"
            elementRef={formRef}
            onSubmit={onSubmit}
            onChange={readBasics}
            hidden={view === "documents" || view === "history"}
          >
            {constitutionId ? (
              <input
                type="hidden"
                name="constitutionId"
                value={constitutionId}
              />
            ) : null}
            {settingsRevisionId ? (
              <input
                type="hidden"
                name="settingsRevisionId"
                value={settingsRevisionId}
              />
            ) : null}
            <input
              type="hidden"
              name="outline"
              value={JSON.stringify(withoutExisting(layers))}
            />
            <StructurePanel id="identity" active={view}>
              <Stack gap="section">
                <OutlineIdentityPanel
                  identity={identity}
                  title={title}
                  creation={guidedCreation}
                  existing={existing}
                  advance={advance}
                >
                  {children}
                </OutlineIdentityPanel>
                {!guidedCreation ? (
                  <StructureOverview
                    layers={layers}
                    onInspect={() => setView("structure")}
                  />
                ) : null}
              </Stack>
            </StructurePanel>
            <StructurePanel id="structure" active={view}>
              <OutlineStructurePanel
                error={showErrors ? outlineError : null}
                toggleTemplates={
                  guidedCreation ? (
                    <Button
                      type="button"
                      aria-expanded={templates}
                      onClick={() => setTemplates(!templates)}
                    >
                      {t(copy.chooseTemplate)}
                    </Button>
                  ) : null
                }
                templates={
                  guidedCreation ? (
                    <div hidden={!templates}>
                      <StructureTemplates
                        value={template}
                        onChoose={chooseTemplate}
                      />
                    </div>
                  ) : null
                }
                next={
                  <Button
                    type="button"
                    onClick={guidedCreation ? () => review() : primary}
                  >
                    {t(
                      constitutionId
                        ? copy.impact
                        : ui.admin.constitutions.outlineeditor.continueToReview,
                    )}
                    <ReaderIcon name="right" />
                  </Button>
                }
              >
                {content}
              </OutlineStructurePanel>
            </StructurePanel>
            <StructurePanel id="review" active={view}>
              <OutlineReviewPanel
                creation={guidedCreation}
                summary={basicsSummary}
                layers={layers}
              >
                <OutlineFeedback
                  showErrors={false}
                  outlineError={outlineError}
                  impactError={impactError}
                  submitError={submitError}
                  impact={impact}
                />
                {impact?.classification === "migration_required" ? (
                  <p>{t(m.migration)}</p>
                ) : null}
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
                  back={() => setView("structure")}
                />
              </OutlineReviewPanel>
            </StructurePanel>
            {submitError && view !== "review" ? (
              <OutlineFeedback
                showErrors={false}
                outlineError={null}
                impactError={false}
                submitError
                impact={null}
              />
            ) : null}
          </Stack>
          <StructurePanel id="documents" active={view}>
            {documents ?? <p>{t(copy.documentsAfterCreate)}</p>}
          </StructurePanel>
          <StructurePanel id="history" active={view}>
            <OutlineHistoryPanel
              previous={previous}
              history={history}
              creation={guidedCreation}
              onRestore={(kinds) => {
                changeLayers(explicitLayers(kinds, true));
                setView("review");
              }}
            />
          </StructurePanel>
        </StructureWorkspaceTemplate>
      )}
    </OutlineWorkspace>
  );
}
