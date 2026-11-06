import type { ReactNode } from "react";
import { T, useTranslation } from "../../components/TranslationProvider";
import { ui, type UiMessage } from "../../../lib/messages";
import type { SettingsImpact } from "../../../lib/api";
import { effectiveDisplayKind, type OutlineKind } from "../../../lib/outline";
import { Alert, Button } from "../../components/ui";
import { Inline } from "../../components/layout/Layout";
import surfaceStyles from "../../components/surfaces.module.css";
import type { OutlineLayer } from "./outline-editor-model";

type CreationProps = {
  guidedCreation: boolean;
  step: number;
  basicsSummary: string;
  layers: OutlineLayer[];
  serializedOutline: string;
  children?: ReactNode;
  advance: () => void;
};
type LayerProps = { layer: OutlineLayer; index: number };
type FeedbackProps = {
  showErrors: boolean;
  outlineError: string | null;
  impactError: boolean;
  submitError: boolean;
  impact: SettingsImpact | null;
};
type SubmitProps = {
  constitutionId?: string;
  settingsRevisionId?: string;
  guidedCreation: boolean;
  step: number;
  submitting: boolean;
  checking: boolean;
  impact: SettingsImpact | null;
  submitLabel: UiMessage;
  checkImpact: () => Promise<void>;
  advance: () => void;
  back: () => void;
};

/** Guided creation retains stage navigation, the same hidden fields and explicit template selection. */
export function OutlineCreationHeader({
  guidedCreation,
  step,
  basicsSummary,
  layers,
  serializedOutline,
  children,
  advance,
}: CreationProps) {
  const t = useTranslation();
  return (
    <>
      {guidedCreation ? (
        <nav
          className="creation-steps"
          aria-label={t(ui.accessibility.creationSteps)}
        >
          {[
            ui.outlineDynamic.basics,
            ui.outlineDynamic.structure,
            ui.outlineDynamic.reviewCreate,
          ].map((name, index) => (
            <span
              key={name.en}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              {index + 1}. {t(name)}
            </span>
          ))}
        </nav>
      ) : null}
      <div hidden={guidedCreation && step !== 1}>{children}</div>
      <input type="hidden" name="outline" value={serializedOutline} />
      {guidedCreation && step === 1 ? (
        <Inline align="end" className="form-row">
          <Button type="button" variant="primary" onClick={advance}>
            <T
              value={ui.admin.constitutions.outlineeditor.continueToStructure}
            />
          </Button>
        </Inline>
      ) : null}
      {guidedCreation && step === 3 ? (
        <section
          className={["card", surfaceStyles.card].join(" ")}
          aria-label={t(ui.accessibility.reviewConstitution)}
        >
          <h2>
            <T
              value={ui.admin.constitutions.outlineeditor.reviewBeforeCreating}
            />
          </h2>
          <p>{basicsSummary}</p>
          <p>{layers.map((layer) => layer.displayLabel).join(" · ")}</p>
          <p>
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .theNewConstitutionCanBeEditedAfter
              }
            />
          </p>
        </section>
      ) : null}
    </>
  );
}

/** Read-only final settings use the same effective display rules as the live reader. */
export function OutlineReviewCard({
  layer,
  index,
  displayKind,
}: LayerProps & { displayKind: OutlineKind }) {
  const effective = effectiveDisplayKind(displayKind)!;
  return (
    <section className={["card", surfaceStyles.card].join(" ")}>
      <h3>
        {index + 1}. {layer.displayLabel}
      </h3>
      <EditorialPolicySummary layer={layer} />
      <ReaderDisplaySummary layer={layer} effective={effective} />
      <StructureSummary layer={layer} />
    </section>
  );
}

/** Heading policies remain authored permissions, independent of effective reader display. */
function EditorialPolicySummary({ layer }: Pick<LayerProps, "layer">) {
  const t = useTranslation();
  return (
    <p>
      <T value={ui.admin.constitutions.outlineeditor.editorTitles} />{" "}
      {t(
        layer.titlePolicy === "none"
          ? ui.admin.constitutions.outlineeditor.notAllowed
          : layer.titlePolicy === "required"
            ? ui.admin.constitutions.outlineeditor.required
            : ui.admin.constitutions.outlineeditor.optional,
      )}{" "}
      <T value={ui.admin.constitutions.outlineeditor.literalLabels} />{" "}
      {t(
        layer.labelPolicy === "none"
          ? ui.admin.constitutions.outlineeditor.notAllowed
          : layer.labelPolicy === "required"
            ? ui.admin.constitutions.outlineeditor.required
            : ui.admin.constitutions.outlineeditor.optional,
      )}
    </p>
  );
}

/** Summarizes effective presentation without modifying any retained saved preference. */
function ReaderDisplaySummary({
  layer,
  effective,
}: Pick<LayerProps, "layer"> & {
  effective: NonNullable<ReturnType<typeof effectiveDisplayKind>>;
}) {
  const t = useTranslation();
  return (
    <p>
      <T value={ui.admin.constitutions.outlineeditor.publicReader} />{" "}
      {t(
        layer.presentation === "concatenated"
          ? ui.outlineDynamic.runningText
          : ui.outlineDynamic.block,
      )}{" "}
      <T value={ui.admin.constitutions.outlineeditor.kind} />{" "}
      {t(
        effective.showKind ? ui.outlineDynamic.shown : ui.outlineDynamic.hidden,
      )}{" "}
      <T value={ui.admin.constitutions.outlineeditor.label} />{" "}
      {effective.showLabel
        ? `${t(ui.outlineDynamic.shown)} (${t(effective.labelPlacement === "after_title" ? ui.admin.constitutions.outlineeditor.afterTitle : effective.labelPlacement === "inline" ? ui.admin.constitutions.outlineeditor.inlineWithText : effective.labelPlacement === "superscript" ? ui.admin.constitutions.outlineeditor.superscriptInText : ui.admin.constitutions.outlineeditor.beforeTitle)})`
        : t(ui.outlineDynamic.hidden)}{" "}
      <T value={ui.admin.constitutions.outlineeditor.title} />{" "}
      {t(
        effective.showTitle
          ? ui.outlineDynamic.shown
          : ui.outlineDynamic.hidden,
      )}
    </p>
  );
}

/** Distinguishes roots, structural parents and text leaves in the final review. */
function StructureSummary({ layer }: Pick<LayerProps, "layer">) {
  return (
    <p>
      {layer.root ? (
        <>
          <T value={ui.outlineDynamic.topLevelKind} /> ·{" "}
        </>
      ) : null}
      {layer.allowedChildKinds?.length ? (
        <T
          value={
            layer.allowTextAlongsideChildren
              ? ui.outlineDynamic.parentTextAllowed
              : ui.outlineDynamic.textInChildren
          }
        />
      ) : (
        <>
          <T value={ui.outlineDynamic.textLeafWith} />{" "}
          <T
            value={
              layer.segmentation === "sentence"
                ? ui.outlineDynamic.sentenceAssistance
                : ui.outlineDynamic.plainEditing
            }
          />
        </>
      )}
    </p>
  );
}

/** Validation, impact and submit errors preserve their original feedback and live-region order. */
export function OutlineFeedback({
  showErrors,
  outlineError,
  impactError,
  submitError,
  impact,
}: FeedbackProps) {
  return (
    <>
      {showErrors && outlineError ? (
        <Alert tone="error">{outlineError}</Alert>
      ) : null}
      {impactError ? (
        <Alert tone="error">
          <T
            value={
              ui.admin.constitutions.outlineeditor
                .impactCouldNotBeCheckedRetryWhen
            }
          />
        </Alert>
      ) : null}
      {submitError ? (
        <Alert tone="error">
          <T
            value={
              ui.admin.constitutions.outlineeditor
                .theConstitutionCouldNotBeSavedTry
            }
          />
        </Alert>
      ) : null}
      {impact ? (
        <section
          aria-live="polite"
          className={["card", surfaceStyles.card].join(" ")}
        >
          <h2>
            <T
              value={
                impact.classification === "migration_required"
                  ? ui.outlineDynamic.migrationRequired
                  : ui.outlineDynamic.safeToSave
              }
            />
          </h2>
          <p>
            {impact.affectedVersionIds.length}{" "}
            <T value={ui.admin.constitutions.outlineeditor.versionsAnd} />{" "}
            {impact.affectedDraftSessionIds.length}{" "}
            <T
              value={
                ui.admin.constitutions.outlineeditor
                  .draftsCheckedPublishedStructuralSettingsRemainPinned
              }
            />
          </p>
          <ul>
            {impact.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {impact.violations.map((violation, index) => (
              <li key={index}>
                {violation.field}: {violation.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Keeps guided creation explicit and existing settings gated by a matching successful impact check. */
export function OutlineSubmitActions({
  constitutionId,
  settingsRevisionId,
  guidedCreation,
  step,
  submitting,
  checking,
  impact,
  submitLabel,
  checkImpact,
  advance,
  back,
}: SubmitProps) {
  return (
    <Inline
      className="form-row outline-submit-actions"
      hidden={guidedCreation && step === 1}
    >
      {constitutionId ? (
        <Button type="button" onClick={checkImpact} disabled={checking}>
          <T
            value={
              checking
                ? ui.outlineDynamic.checkingImpact
                : ui.outlineDynamic.previewImpact
            }
          />
        </Button>
      ) : null}
      {guidedCreation ? (
        <>
          <Button type="button" onClick={back}>
            <T value={ui.admin.constitutions.outlineeditor.back} />
          </Button>
          {step === 2 ? (
            <Button
              type="button"
              variant="primary"
              onClick={(event) => {
                event.preventDefault();
                advance();
              }}
            >
              <T
                value={ui.admin.constitutions.outlineeditor.continueToReview}
              />
            </Button>
          ) : (
            <Button variant="primary" data-create="true" disabled={submitting}>
              <T
                value={
                  submitting
                    ? ui.outlineDynamic.creating
                    : ui.outlineDynamic.createConstitution
                }
              />
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="primary"
          disabled={
            submitting ||
            checking ||
            (Boolean(constitutionId) &&
              (!impact ||
                impact.classification === "migration_required" ||
                impact.currentRevisionId !== settingsRevisionId))
          }
        >
          <T value={submitting ? ui.outlineDynamic.saving : submitLabel} />
        </Button>
      )}
    </Inline>
  );
}
