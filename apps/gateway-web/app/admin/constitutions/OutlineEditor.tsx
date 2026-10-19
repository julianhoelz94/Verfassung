'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../lib/messages';
import type { FormEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Alert, Button, Input, Select } from '../../components/ui';
import { SettingInfo } from '../../components/SettingInfo';
import type { OutlineKindWrite, SettingsImpact, ContentOutline, OrderedNode, OrderedEntry } from '../../../lib/api';
import { asOutlinePresentation, effectiveDisplayKind, kindByCode } from '../../../lib/outline';
import { OrderedContentTree } from '../../components/ConstitutionText';
import { outlineFromTemplate, type ConstitutionTemplate } from '../../../lib/constitution-templates';
import { saveOutlineAction, previewOutlineImpactAction } from './actions';

type Layer = OutlineKindWrite & { existing?: boolean };

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

function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'layer';
}

function withoutExisting(layers: Layer[]): OutlineKindWrite[] {
  return layers.map(({ existing: _ignored, ...kind }) => kind);
}

function explicitLayers(kinds: OutlineKindWrite[], existing: boolean): Layer[] {
  return kinds.map((kind, index) => ({
    ...kind,
    root: kind.root ?? index === 0,
    allowedChildKinds: kind.allowedChildKinds ?? (kinds[index + 1] ? [kinds[index + 1]!.kindCode] : []),
    existing,
  }));
}

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
  const [template, setTemplate] = useState<ConstitutionTemplate>('sentences');
  const t = useTranslation();
  const [showErrors, setShowErrors] = useState(false);
  const [basicsSummary, setBasicsSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(
    explicitLayers(initial, Boolean(constitutionId)),
  );

  const [impact, setImpact] = useState<SettingsImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function checkImpact() {
    setChecking(true);
    setImpactError(false);
    try {
      const data = new FormData();
      data.set('constitutionId', constitutionId ?? '');
      data.set('outline', JSON.stringify(withoutExisting(layers)));
      const result = await previewOutlineImpactAction(data);
      if ('redirectTo' in result) { window.location.assign(result.redirectTo); return; }
      setImpact(result);
    } catch { setImpactError(true); } finally { setChecking(false); }
  }

  function update(index: number, patch: Partial<Layer>) {
    setImpact(null);
    setLayers((current) => current.map((layer, i) => {
      const renamed = patch.kindCode && patch.kindCode !== current[index]?.kindCode;
      const children = renamed ? layer.allowedChildKinds?.map(code => code === current[index]?.kindCode ? patch.kindCode! : code) : layer.allowedChildKinds;
      return i === index ? { ...layer, ...patch, allowedChildKinds: patch.allowedChildKinds ?? children } : { ...layer, allowedChildKinds: children };
    }));
  }

  function addLayer() {
    setImpact(null);
    setLayers((current) => {
      const added: Layer = {
        kindCode: `layer-${current.length + 1}`,
        displayLabel: t(ui.remainingStatus.newLayer),
        presentation: 'section',
        showLabel: true,
        showTitle: true,
        showKind: false,
        root: false,
        allowedChildKinds: [],
        existing: false,
      };
      const leaf = current[current.length - 1];
      // Sentence units stay terminal; add a structural level above them.
      if (leaf?.kindCode === 'sentence') {
        const parent = current[current.length - 2];
        return [...current.slice(0, -2), ...(parent ? [{ ...parent, allowedChildKinds: parent.allowedChildKinds?.map(code => code === 'sentence' ? added.kindCode : code) }] : []), { ...added, allowedChildKinds: ['sentence'] }, leaf];
      }
      return [...current.slice(0, -1), ...(leaf ? [{ ...leaf, allowedChildKinds: [...(leaf.allowedChildKinds ?? []), added.kindCode], segmentation: 'plain' as const }] : []), added];
    });
  }

  function addRootKind() {
    setImpact(null);
    setLayers(current => [...current, {
      kindCode: `root-${current.length + 1}`, displayLabel: t(ui.remainingStatus.newSection), presentation: 'section',
      showLabel: false, showTitle: true, showKind: true, root: true, allowedChildKinds: [], existing: false,
    }]);
  }

  function removeLayer(index: number) {
    if (layers.length === 1) {
      return;
    }
    setImpact(null);
    setLayers((current) => current.filter((_, i) => i !== index).map(layer => {
      const children = layer.allowedChildKinds?.filter(code => code !== current[index]?.kindCode) ?? [];
      return { ...layer, allowedChildKinds: children, allowTextAlongsideChildren: children.length ? layer.allowTextAlongsideChildren : false };
    }));
  }

  const exampleOutline: ContentOutline = { kinds: layers.map((layer, index) => ({ ...layer, sortOrder: index + 1, mayHoldText: !layer.allowedChildKinds?.length || Boolean(layer.allowTextAlongsideChildren), mayHoldChildren: Boolean(layer.allowedChildKinds?.length), allowedChildKinds: layer.allowedChildKinds ?? [] })) };
  const example = layers.filter(layer => layer.root).map((layer, index) => exampleNode(layers, layer.kindCode, `sample-${index}`, index, new Set(), t)).filter((node): node is OrderedNode => Boolean(node));
  const codes = layers.map((layer) => layer.kindCode.trim().toLowerCase());
  const outlineError = layers.some((layer) => !layer.displayLabel.trim() || !layer.kindCode.trim())
    ? t(ui.remainingStatus.outlineNameRequired)
    : new Set(codes).size !== codes.length
      ? t(ui.remainingStatus.outlineUniqueCodes)
      : !layers.some(layer => layer.root) ? t(ui.remainingStatus.outlineRootRequired)
        : layers.some(layer => layer.allowedChildKinds?.some(code => !codes.includes(code))) ? t(ui.remainingStatus.outlineMissingChild)
          : null;

  function advance() {
    if (step === 1) {
      if (!formRef.current?.reportValidity()) return;
      const data = new FormData(formRef.current);
      setBasicsSummary(`${data.get('title') || t(ui.remainingStatus.untitledConstitution)} · ${data.get('isoCode') || ''}`);
      setStep(2);
      return;
    }
    if (outlineError) { setShowErrors(true); return; }
    setStep(3);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (guidedCreation && (step !== 3 || submitter?.getAttribute('data-create') !== 'true')) {
      if (step !== 3) advance();
      return;
    }
    if (guidedCreation && outlineError) { setShowErrors(true); return; }
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
    <form ref={formRef} onSubmit={onSubmit}>
      {constitutionId ? <input type="hidden" name="constitutionId" value={constitutionId} /> : null}
      {settingsRevisionId ? <input type="hidden" name="settingsRevisionId" value={settingsRevisionId} /> : null}
      {guidedCreation ? <nav className="creation-steps" aria-label={t(ui.accessibility.creationSteps)}>
        {[ui.outlineDynamic.basics, ui.outlineDynamic.structure, ui.outlineDynamic.reviewCreate].map((name, index) => <span key={name.en} aria-current={step === index + 1 ? 'step' : undefined}>{index + 1}. {t(name)}</span>)}
      </nav> : null}
      <div hidden={guidedCreation && step !== 1}>{children}</div>
      <input type="hidden" name="outline" value={JSON.stringify(withoutExisting(layers))} />
      {guidedCreation && step === 1 ? <div className="form-row"><Button type="button" variant="primary" onClick={advance}><T value={ui.admin.constitutions.outlineeditor.continueToStructure} /></Button></div> : null}
      {guidedCreation && step === 2 ? <section aria-label={t(ui.accessibility.startingStructure)}>
        <h2 className="setting-inline"><T value={ui.admin.constitutions.outlineeditor.startingStructure} />{" "}<SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.startingStructure} />} description={<T value={ui.help.initialStructureHelp} />} changeability="review" /></h2>
        <p className="muted"><T value={ui.admin.constitutions.outlineeditor.chooseAStartingPointThenAdjustEvery} /></p>
        <div className="creation-templates">
          {([['articles', ui.outlineDynamic.articlesOnly, ui.outlineDynamic.articlesOnlyDetail], ['sections', ui.outlineDynamic.articlesSections, ui.outlineDynamic.articlesSectionsDetail], ['sentences', ui.outlineDynamic.articlesParagraphsSentences, ui.outlineDynamic.articlesParagraphsSentencesDetail]] as const).map(([id, title, detail]) => <button key={id} type="button" className="creation-template" aria-pressed={template === id} onClick={() => { setTemplate(id); setLayers(explicitLayers(outlineFromTemplate(id), false)); setShowErrors(false); }}><strong>{t(title)}</strong><span>{t(detail)}</span></button>)}
        </div>
      </section> : null}
      {guidedCreation && step === 3 ? <section className="card" aria-label={t(ui.accessibility.reviewConstitution)}><h2><T value={ui.admin.constitutions.outlineeditor.reviewBeforeCreating} /></h2><p>{basicsSummary}</p><p>{layers.map((layer) => layer.displayLabel).join(' → ')}</p><p><T value={ui.admin.constitutions.outlineeditor.theNewConstitutionCanBeEditedAfter} /></p></section> : null}
      <div className="outline-config-layout" hidden={guidedCreation && step === 1}>
      {guidedCreation && step === 3 ? <div className="stack" aria-label={t(ui.accessibility.finalStructureSettings)}>
        {layers.map((layer, index) => {
          const effective = effectiveDisplayKind(exampleOutline.kinds[index])!;
          return <section className="card" key={`${layer.kindCode}-${index}`}>
          <h3>{index + 1}. {layer.displayLabel}</h3>
          <p><T value={ui.admin.constitutions.outlineeditor.editorTitles} />{" "}{t(layer.titlePolicy === 'none' ? ui.admin.constitutions.outlineeditor.notAllowed : layer.titlePolicy === 'required' ? ui.admin.constitutions.outlineeditor.required : ui.admin.constitutions.outlineeditor.optional)} <T value={ui.admin.constitutions.outlineeditor.literalLabels} />{" "}{t(layer.labelPolicy === 'none' ? ui.admin.constitutions.outlineeditor.notAllowed : layer.labelPolicy === 'required' ? ui.admin.constitutions.outlineeditor.required : ui.admin.constitutions.outlineeditor.optional)}</p>
          <p><T value={ui.admin.constitutions.outlineeditor.publicReader} />{" "}{t(layer.presentation === 'concatenated' ? ui.outlineDynamic.runningText : ui.outlineDynamic.block)} <T value={ui.admin.constitutions.outlineeditor.kind} />{" "}{t(effective.showKind ? ui.outlineDynamic.shown : ui.outlineDynamic.hidden)} <T value={ui.admin.constitutions.outlineeditor.label} />{" "}{effective.showLabel ? `${t(ui.outlineDynamic.shown)} (${t(effective.labelPlacement === 'after_title' ? ui.admin.constitutions.outlineeditor.afterTitle : effective.labelPlacement === 'inline' ? ui.admin.constitutions.outlineeditor.inlineWithText : effective.labelPlacement === 'superscript' ? ui.admin.constitutions.outlineeditor.superscriptInText : ui.admin.constitutions.outlineeditor.beforeTitle)})` : t(ui.outlineDynamic.hidden)} <T value={ui.admin.constitutions.outlineeditor.title} />{" "}{t(effective.showTitle ? ui.outlineDynamic.shown : ui.outlineDynamic.hidden)}</p>
          <p>{layer.root ? <><T value={ui.outlineDynamic.topLevelKind} /> · </> : null}{layer.allowedChildKinds?.length ? <T value={layer.allowTextAlongsideChildren ? ui.outlineDynamic.parentTextAllowed : ui.outlineDynamic.textInChildren} /> : <><T value={ui.outlineDynamic.textLeafWith} /> <T value={layer.segmentation === 'sentence' ? ui.outlineDynamic.sentenceAssistance : ui.outlineDynamic.plainEditing} /></>}</p>
          </section>;
        })}
      </div> : <ol className="stack">
        {layers.map((layer, index) => (
          <li key={`${layer.kindCode}-${index}`} className="card">
            <p>
              <T value={ui.admin.constitutions.outlineeditor.layer} />{" "}{index + 1}
              {layer.root ? t(ui.remainingStatus.topLevelKind) : ''}
              {t(!layer.allowedChildKinds?.length ? ui.remainingStatus.textLeaf : ui.remainingStatus.structuralKind)}
            </p>
            <Input
              label={<T value={ui.attrs.adminConstitutionsOutlineeditorInputLabelLabel} />}
              info={{ description: <T value={ui.help.levelLabelHelp} />, changeability: 'review' }}
              name={`label-${index}`}
              value={layer.displayLabel}
              onChange={(event) => {
                const displayLabel = event.target.value;
                update(index, {
                  displayLabel,
                  kindCode: layer.existing ? layer.kindCode : slugify(displayLabel),
                });
              }}
            />
            <details className="creation-advanced">
              <summary><T value={ui.admin.constitutions.outlineeditor.advancedGeneratedCode} /></summary>
            <Input
              label={<T value={ui.attrs.adminConstitutionsOutlineeditorInputLabelKind} />}
              info={{ description: <T value={ui.help.levelKindCodeHelp} />, changeability: 'once', changeNote: <T value={ui.help.levelKindCodeChange} /> }}
              name={`code-${index}`}
              value={layer.kindCode}
              readOnly={layer.existing}
              disabled={layer.existing}
              onChange={(event) => {
                if (!layer.existing) {
                  update(index, { kindCode: slugify(event.target.value) });
                }
              }}
            />
            </details>
            <fieldset>
              <legend><T value={ui.admin.constitutions.outlineeditor.structure} /></legend>
              <label className="choice-row"><input type="checkbox" checked={Boolean(layer.root)} onChange={event => update(index, { root: event.target.checked })} /> <T value={ui.admin.constitutions.outlineeditor.mayAppearAtTheTopLevel} /></label>
              <p className="muted"><T value={ui.admin.constitutions.outlineeditor.allowedChildKinds} /></p>
              {layers.filter(candidate => candidate.kindCode !== layer.kindCode).map(candidate => <label className="choice-row" key={candidate.kindCode}>
                <input type="checkbox" checked={Boolean(layer.allowedChildKinds?.includes(candidate.kindCode))} onChange={event => update(index, { allowedChildKinds: event.target.checked ? [...(layer.allowedChildKinds ?? []), candidate.kindCode] : (layer.allowedChildKinds ?? []).filter(code => code !== candidate.kindCode) })} /> {candidate.displayLabel}
              </label>)}
            </fieldset>
            <fieldset>
              <legend><T value={ui.admin.constitutions.outlineeditor.editorPermissions} /></legend>
              {Boolean(layer.allowedChildKinds?.length) ? (
                <div className="field">
                  <span className="setting-inline"><label className="choice-row"><input type="checkbox" checked={Boolean(layer.allowTextAlongsideChildren)} onChange={(event) => update(index, { allowTextAlongsideChildren: event.target.checked })} /> <T value={ui.admin.constitutions.outlineeditor.allowTextAlongsideChildUnits} /></label><SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.allowTextAlongsideChildUnits} />} description={<T value={ui.help.unnumberedTextHelp} />} changeability="review" /></span>
                  <span className="muted"><T value={ui.admin.constitutions.outlineeditor.unnumberedParentTextCanAppearBeforeBetween} /></span>
                </div>
              ) : <p><T value={ui.admin.constitutions.outlineeditor.thisFinalLevelHoldsTextAndHas} /></p>}
              <Select label={<T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelEditorial} />} info={{ description: <T value={ui.help.editorialTitlePolicyHelp} />, changeability: 'review' }} name={`title-policy-${index}`} value={layer.titlePolicy ?? 'optional'} onChange={(event) => update(index, { titlePolicy: event.target.value as Layer['titlePolicy'], showTitle: event.target.value === 'none' ? false : layer.showTitle })}>
                <option value="none"><T value={ui.admin.constitutions.outlineeditor.notAllowed} /></option><option value="optional"><T value={ui.admin.constitutions.outlineeditor.optional} /></option><option value="required"><T value={ui.admin.constitutions.outlineeditor.required} /></option>
              </Select>
              <Select label={<T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelLiteral} />} info={{ description: <T value={ui.help.legalLabelPolicyHelp} />, changeability: 'review' }} name={`label-policy-${index}`} value={layer.labelPolicy ?? 'optional'} onChange={(event) => update(index, { labelPolicy: event.target.value as Layer['labelPolicy'], showLabel: event.target.value === 'none' ? false : layer.showLabel })}>
                <option value="none"><T value={ui.admin.constitutions.outlineeditor.notAllowed} /></option><option value="optional"><T value={ui.admin.constitutions.outlineeditor.optional} /></option><option value="required"><T value={ui.admin.constitutions.outlineeditor.required} /></option>
              </Select>
              <p className="muted"><T value={ui.admin.constitutions.outlineeditor.labelsSuchAs46aBisAnd2a} /></p>
              {!layer.allowedChildKinds?.length ? <Select label={<T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelText} />} info={{ description: <T value={ui.help.textEditingHelp} />, changeability: 'review' }} name={`segmentation-${index}`} value={layer.segmentation ?? 'plain'} onChange={(event) => update(index, { segmentation: event.target.value as Layer['segmentation'] })}>
                <option value="plain"><T value={ui.admin.constitutions.outlineeditor.plainText} /></option><option value="sentence"><T value={ui.admin.constitutions.outlineeditor.sentenceBoundaryAssistance} /></option>
              </Select> : null}
            </fieldset>
            <fieldset>
              <legend><T value={ui.admin.constitutions.outlineeditor.publicReaderDisplay} /></legend>
            <Select
              label={<T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelHow} />}
              info={{ description: <T value={ui.help.levelPresentationHelp} />, changeability: 'review' }}
              name={`presentation-${index}`}
              value={layer.presentation}
              onChange={(event) => update(index, { presentation: asOutlinePresentation(event.target.value) })}
            >
              <option value="section"><T value={ui.admin.constitutions.outlineeditor.blockWithOptionalHeading} /></option>
              <option value="concatenated"><T value={ui.admin.constitutions.outlineeditor.runningTextNoTitleJoinedWithSiblings} /></option>
            </Select>
            {(
              <>
                <div className="field">
                  <span className="setting-inline"><label className="field-label choice-row">
                    <input
                      type="checkbox"
                      checked={layer.showKind}
                      disabled={layer.presentation === 'concatenated'}
                      onChange={(event) => update(index, { showKind: event.target.checked })}
                    />{' '}
                    <T value={ui.admin.constitutions.outlineeditor.showKindName} />{layer.displayLabel})
                  </label><SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.showKindName} />} description={<T value={ui.help.kindNameHelp} />} changeability="review" /></span>
                </div>
                <div className="field">
                  <span className="setting-inline"><label className="field-label choice-row">
                    <input
                      type="checkbox"
                      checked={layer.showLabel}
                      disabled={layer.labelPolicy === 'none' || (layer.presentation === 'concatenated' && !['inline', 'superscript'].includes(layer.labelPlacement ?? 'before_title'))}
                      onChange={(event) => update(index, { showLabel: event.target.checked })}
                    />{' '}
                    <T value={ui.admin.constitutions.outlineeditor.showLiteralLegalLabel} />{" "}</label><SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.showLiteralLegalLabel} />} description={<T value={ui.help.literalLabelHelp} />} changeability="review" /></span>
                </div>
                <div className="field">
                  <span className="setting-inline"><label className="field-label choice-row">
                    <input
                      type="checkbox"
                      checked={layer.showTitle}
                      disabled={layer.titlePolicy === 'none' || layer.presentation === 'concatenated'}
                      onChange={(event) => update(index, { showTitle: event.target.checked })}
                    />{' '}
                    <T value={ui.admin.constitutions.outlineeditor.showEditorialTitle} />{" "}</label><SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.showEditorialTitle} />} description={<T value={ui.help.editorialTitleHelp} />} changeability="review" /></span>
                </div>
              </>
            )}
              {layer.presentation === 'concatenated' ? <p className="muted"><T value={ui.admin.constitutions.outlineeditor.runningTextHidesKindNamesAndEditorial} /></p> : null}
              {layer.titlePolicy === 'none' || layer.labelPolicy === 'none' ? <p className="muted"><T value={ui.admin.constitutions.outlineeditor.aNameOrLabelSetToNot} /></p> : null}
              {layer.titlePolicy === 'optional' && layer.showTitle && layer.presentation !== 'concatenated' ? <p className="muted"><T value={ui.admin.constitutions.outlineeditor.untitledUnitsPlaceAVisibleLabelBefore} /></p> : null}
              <Select label={<T value={ui.attrs.adminConstitutionsOutlineeditorSelectLabelLabel} />} info={{ description: <T value={ui.help.labelPlacementHelp} />, changeability: 'review' }} name={`label-placement-${index}`} value={layer.labelPlacement ?? 'before_title'} disabled={layer.labelPolicy === 'none' || (!layer.showLabel && layer.presentation !== 'concatenated')} onChange={(event) => update(index, { labelPlacement: event.target.value as Layer['labelPlacement'] })}>
                <option value="before_title" disabled={layer.presentation === 'concatenated'}><T value={ui.admin.constitutions.outlineeditor.beforeTitle} /></option><option value="after_title" disabled={layer.presentation === 'concatenated' || !layer.showTitle || layer.titlePolicy === 'none'}><T value={ui.admin.constitutions.outlineeditor.afterTitle} /></option><option value="inline" disabled={index < layers.length - 1 && !layer.allowTextAlongsideChildren}><T value={ui.admin.constitutions.outlineeditor.inlineWithText} /></option>{index === layers.length - 1 ? <option value="superscript"><T value={ui.admin.constitutions.outlineeditor.superscriptInText} /></option> : null}
              </Select>
              {!layer.showLabel && layer.presentation !== 'concatenated' ? <p className="muted"><T value={ui.admin.constitutions.outlineeditor.showLiteralLegalLabelToChooseIts} /></p> : null}
            </fieldset>
            {index > 0 ? (
              <span className="setting-inline"><Button type="button" onClick={() => removeLayer(index)}>
                <T value={ui.admin.constitutions.outlineeditor.removeLevel} />{" "}</Button><SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.removeLevel} />} description={<T value={ui.help.removeLevelHelp} />} changeability="review" /></span>
            ) : null}
          </li>
        ))}
      </ol>}
      <aside className="card outline-live-preview" aria-label={t(ui.accessibility.liveOrderExample)}>
        <h2><T value={sampleRoots.length ? ui.outlineDynamic.proposedSample : ui.outlineDynamic.liveExample} /></h2>
        <p className="muted"><T value={ui.admin.constitutions.outlineeditor.parentTextIsUnnumberedAndBelongsTo} /></p>
        <h3><T value={ui.admin.constitutions.outlineeditor.structureMap} /></h3>
        {(sampleRoots.length ? sampleRoots : example).map(node => <ExampleMap key={node.occurrenceId} node={node} outline={exampleOutline} />)}
        <h3><T value={ui.admin.constitutions.outlineeditor.readerPreview} /></h3>
        <OrderedContentTree entries={(sampleRoots.length ? sampleRoots : example).map(node => ({ type: 'child' as const, node }))} outline={exampleOutline} />
        {constitutionId ? <p><T value={ui.admin.constitutions.outlineeditor.occupiedStructureAndStricterPermissionsAreChecked} /></p> : null}
      </aside>
      </div>
      {guidedCreation && showErrors && outlineError ? <Alert tone="error">{outlineError}</Alert> : null}
      {impactError ? <Alert tone="error"><T value={ui.admin.constitutions.outlineeditor.impactCouldNotBeCheckedRetryWhen} /></Alert> : null}
      {submitError ? <Alert tone="error"><T value={ui.admin.constitutions.outlineeditor.theConstitutionCouldNotBeSavedTry} /></Alert> : null}
      {impact ? <section aria-live="polite" className="card">
        <h2><T value={impact.classification === 'migration_required' ? ui.outlineDynamic.migrationRequired : ui.outlineDynamic.safeToSave} /></h2>
        <p>{impact.affectedVersionIds.length} <T value={ui.admin.constitutions.outlineeditor.versionsAnd} />{" "}{impact.affectedDraftSessionIds.length} <T value={ui.admin.constitutions.outlineeditor.draftsCheckedPublishedStructuralSettingsRemainPinned} /></p>
        <ul>{impact.reasons.map((reason) => <li key={reason}>{reason}</li>)}{impact.violations.map((violation, index) => <li key={index}>{violation.field}: {violation.message}</li>)}</ul>
      </section> : null}
      <div className="form-row" hidden={guidedCreation && step === 1}>
        {(!guidedCreation || step === 2) ? <Button type="button" onClick={addLayer}>
          <T value={ui.admin.constitutions.outlineeditor.addDeeperLayer} />{" "}</Button> : null}
        {(!guidedCreation || step === 2) ? <Button type="button" onClick={addRootKind}><T value={ui.admin.constitutions.outlineeditor.addTopLevelKind} /></Button> : null}
        {(!guidedCreation || step === 2) ? <SettingInfo label={<T value={ui.admin.constitutions.outlineeditor.addDeeperLayer} />} description={<T value={ui.help.addDeeperLevelHelp} />} changeability="review" /> : null}
        {(!guidedCreation || step === 2) && layers[layers.length - 1]?.kindCode === 'sentence' ? <p className="muted"><T value={ui.admin.constitutions.outlineeditor.newLevelsAreAddedBeforeTheFinal} /></p> : null}
        {constitutionId ? <Button type="button" onClick={checkImpact} disabled={checking}><T value={checking ? ui.outlineDynamic.checkingImpact : ui.outlineDynamic.previewImpact} /></Button> : null}
        {guidedCreation ? <>
          <Button type="button" onClick={() => { setStep(step === 3 ? 2 : 1); setShowErrors(false); }}><T value={ui.admin.constitutions.outlineeditor.back} /></Button>
          {step === 2 ? <Button type="button" variant="primary" onClick={(event) => { event.preventDefault(); advance(); }}><T value={ui.admin.constitutions.outlineeditor.continueToReview} /></Button> : <Button variant="primary" data-create="true" disabled={submitting}><T value={submitting ? ui.outlineDynamic.creating : ui.outlineDynamic.createConstitution} /></Button>}
        </> : <Button variant="primary" disabled={submitting || checking || (Boolean(constitutionId) && (!impact || impact.classification === 'migration_required' || impact.currentRevisionId !== settingsRevisionId))}><T value={submitting ? ui.outlineDynamic.saving : submitLabel} /></Button>}
      </div>
    </form>
  );
}

function exampleNode(layers: Layer[], kindCode: string, path: string, sibling: number, ancestors: Set<string>, t: (value: UiMessage) => string): OrderedNode | null {
  const level = layers.find(layer => layer.kindCode === kindCode);
  if (!level) return null;
  if (ancestors.has(kindCode)) return null;
  const children = level.allowedChildKinds ?? [];
  const leaf = children.length === 0;
  const content: OrderedEntry[] = [];
  function text(position: string, words: string) { content.push({ type: 'text', logicalId: `${path}-${position}`, occurrenceId: `${path}-${position}`, text: words }); }
  if (leaf) text('text', t(sibling === 0 ? ui.remainingStatus.sampleEqualProtection : ui.remainingStatus.sampleProtectRights));
  else {
    if (level.allowTextAlongsideChildren) text('before', t(ui.remainingStatus.sampleFollowingRights));
    const first = exampleNode(layers, children[0], `${path}-a`, 0, new Set([...ancestors, kindCode]), t);
    if (first) content.push({ type: 'child', node: first });
    if (level.allowTextAlongsideChildren) text('between', t(ui.remainingStatus.sampleRightsEveryone));
    const second = exampleNode(layers, children[1] ?? children[0], `${path}-b`, 1, new Set([...ancestors, kindCode]), t);
    if (second) content.push({ type: 'child', node: second });
    if (level.allowTextAlongsideChildren) text('after', t(ui.remainingStatus.sampleUpholdGuarantees));
  }
  return { logicalId: path, revisionId: path, occurrenceId: path, kind: level.kindCode,
    label: level.labelPolicy === 'none' ? null : level.root ? '46a' : sibling === 0 ? '(1)' : '(2a)',
    title: level.titlePolicy === 'none' || (level.titlePolicy === 'optional' && sibling > 0) ? null : `${level.displayLabel} ${t(ui.remainingStatus.example)}`, content };
}

function ExampleMap({ node, outline }: { node: OrderedNode; outline: ContentOutline }) {
  return <div className="outline-example-level">
    <strong>{kindByCode(outline, node.kind)?.displayLabel ?? node.kind} {node.label}</strong>
    <ol>{node.content.map((entry, index) => <li key={entry.node?.occurrenceId ?? entry.occurrenceId ?? index}>
      {entry.type === 'child' && entry.node ? <ExampleMap node={entry.node} outline={outline} /> : <><small><T value={ui.admin.constitutions.outlineeditor.unnumberedParentText} /></small> {entry.text}</>}
    </li>)}</ol>
  </div>;
}
