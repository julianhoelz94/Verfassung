'use client';

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
  submitLabel?: string;
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

export function OutlineEditor({
  constitutionId,
  settingsRevisionId,
  initial,
  action = saveOutlineAction,
  submitLabel = 'Save outline',
  children,
  guidedCreation = false,
  sampleRoots = [],
}: OutlineEditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState<ConstitutionTemplate>('sentences');
  const [showErrors, setShowErrors] = useState(false);
  const [basicsSummary, setBasicsSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(
    initial.map((kind) => ({ ...kind, existing: Boolean(constitutionId) })),
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
    setLayers((current) => current.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
  }

  function addLayer() {
    setImpact(null);
    setLayers((current) => {
      const added: Layer = {
        kindCode: `layer-${current.length + 1}`,
        displayLabel: 'New layer',
        presentation: 'section',
        showLabel: true,
        showTitle: true,
        showKind: false,
        existing: false,
      };
      const leaf = current[current.length - 1];
      // Sentence units stay terminal; add a structural level above them.
      if (leaf?.kindCode === 'sentence') return [...current.slice(0, -1), added, leaf];
      return [...current.map((layer) => ({ ...layer, segmentation: 'plain' as const })), added];
    });
  }

  function removeLayer(index: number) {
    if (index === 0) {
      return;
    }
    setImpact(null);
    setLayers((current) => current.filter((_, i) => i !== index).map((layer, i, next) => ({ ...layer, allowTextAlongsideChildren: i === next.length - 1 ? false : layer.allowTextAlongsideChildren })));
  }

  const exampleOutline: ContentOutline = { kinds: layers.map((layer, index) => ({ ...layer, sortOrder: index + 1, mayHoldText: index === layers.length - 1 || Boolean(layer.allowTextAlongsideChildren), mayHoldChildren: index < layers.length - 1, allowedChildKinds: layers[index + 1] ? [layers[index + 1]!.kindCode] : [] })) };
  const example = exampleNode(layers, 0, 'sample', 0);
  const codes = layers.map((layer) => layer.kindCode.trim().toLowerCase());
  const outlineError = layers.some((layer) => !layer.displayLabel.trim() || !layer.kindCode.trim())
    ? 'Give every level a name and a generated code.'
    : new Set(codes).size !== codes.length
      ? 'Each level needs a different code. Change a level name or its code under Advanced.'
      : null;

  function advance() {
    if (step === 1) {
      if (!formRef.current?.reportValidity()) return;
      const data = new FormData(formRef.current);
      setBasicsSummary(`${data.get('title') || 'Untitled constitution'} · ${data.get('isoCode') || ''}`);
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
      {guidedCreation ? <nav className="creation-steps" aria-label="Creation steps">
        {['Basics', 'Structure', 'Review & create'].map((name, index) => <span key={name} aria-current={step === index + 1 ? 'step' : undefined}>{index + 1}. {name}</span>)}
      </nav> : null}
      <div hidden={guidedCreation && step !== 1}>{children}</div>
      <input type="hidden" name="outline" value={JSON.stringify(withoutExisting(layers))} />
      {guidedCreation && step === 1 ? <div className="form-row"><Button type="button" variant="primary" onClick={advance}>Continue to structure</Button></div> : null}
      {guidedCreation && step === 2 ? <section aria-label="Starting structure">
        <h2 className="setting-inline">Starting structure <SettingInfo label="Starting structure" description="Choose a template for the initial levels. You can adjust every level before creation and revise the structure later after an impact check." changeability="review" /></h2>
        <p className="muted">Choose a starting point, then adjust every level below. Changing templates replaces the current level settings.</p>
        <div className="creation-templates">
          {([['articles', 'Articles only', 'A short constitution with text in each article'], ['sections', 'Articles and sections', 'Two levels with plain text in each section'], ['sentences', 'Articles, paragraphs, sentences', 'Three levels with sentence editing tools']] as const).map(([id, title, detail]) => <button key={id} type="button" className="creation-template" aria-pressed={template === id} onClick={() => { setTemplate(id); setLayers(outlineFromTemplate(id).map((kind) => ({ ...kind, existing: false }))); setShowErrors(false); }}><strong>{title}</strong><span>{detail}</span></button>)}
        </div>
      </section> : null}
      {guidedCreation && step === 3 ? <section className="card" aria-label="Review constitution"><h2>Review before creating</h2><p>{basicsSummary}</p><p>{layers.map((layer) => layer.displayLabel).join(' → ')}</p><p>The new constitution can be edited after creation. Content and versions are added in the editor.</p></section> : null}
      <div className="outline-config-layout" hidden={guidedCreation && step === 1}>
      {guidedCreation && step === 3 ? <div className="stack" aria-label="Final structure settings">
        {layers.map((layer, index) => {
          const effective = effectiveDisplayKind(exampleOutline.kinds[index])!;
          return <section className="card" key={`${layer.kindCode}-${index}`}>
          <h3>{index + 1}. {layer.displayLabel}</h3>
          <p>Editor titles: {layer.titlePolicy ?? 'optional'} · Literal labels: {layer.labelPolicy ?? 'optional'}</p>
          <p>Public reader: {layer.presentation === 'concatenated' ? 'running text' : 'block'} · Kind {effective.showKind ? 'shown' : 'hidden'} · Label {effective.showLabel ? `shown (${(effective.labelPlacement ?? 'before_title').replaceAll('_', ' ')})` : 'hidden'} · Title {effective.showTitle ? 'shown' : 'hidden'}</p>
          <p>{index < layers.length - 1 ? layer.allowTextAlongsideChildren ? 'Unnumbered parent text allowed alongside children' : 'Text stays in child units' : `Final text with ${layer.segmentation === 'sentence' ? 'sentence boundary assistance' : 'plain editing'}`}</p>
          </section>;
        })}
      </div> : <ol className="stack">
        {layers.map((layer, index) => (
          <li key={`${layer.kindCode}-${index}`} className="card">
            <p>
              Layer {index + 1}
              {index === 0 ? ' (top provision)' : ''}
              {index === layers.length - 1 ? ' · Text leaf' : ' · Structural level'}
            </p>
            <Input
              label="Label"
              info={{ description: 'The reader-facing name of this structural level, such as Article or Paragraph.', changeability: 'review' }}
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
              <summary>Advanced · generated code</summary>
            <Input
              label="Kind code"
              info={{ description: 'The internal identifier for this level. It is generated from the label.', changeability: 'once', changeNote: 'Set once when this level is first saved.' }}
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
              <legend>Editor permissions</legend>
              {index < layers.length - 1 ? (
                <div className="field">
                  <span className="setting-inline"><label className="choice-row"><input type="checkbox" checked={Boolean(layer.allowTextAlongsideChildren)} onChange={(event) => update(index, { allowTextAlongsideChildren: event.target.checked })} /> Allow text alongside child units</label><SettingInfo label="Allow text alongside child units" description="Allow unnumbered text before, between, or after the child units at this level." changeability="review" /></span>
                  <span className="muted">Unnumbered parent text can appear before, between, or after child units.</span>
                </div>
              ) : <p>This final level holds text and has no child units.</p>}
              <Select label="Editorial titles" info={{ description: 'Choose whether units at this level can or must have an editorial title.', changeability: 'review' }} name={`title-policy-${index}`} value={layer.titlePolicy ?? 'optional'} onChange={(event) => update(index, { titlePolicy: event.target.value as Layer['titlePolicy'], showTitle: event.target.value === 'none' ? false : layer.showTitle })}>
                <option value="none">Not allowed</option><option value="optional">Optional</option><option value="required">Required</option>
              </Select>
              <Select label="Literal legal labels" info={{ description: 'Choose whether source labels, such as 46a or (2a), can or must be entered.', changeability: 'review' }} name={`label-policy-${index}`} value={layer.labelPolicy ?? 'optional'} onChange={(event) => update(index, { labelPolicy: event.target.value as Layer['labelPolicy'], showLabel: event.target.value === 'none' ? false : layer.showLabel })}>
                <option value="none">Not allowed</option><option value="optional">Optional</option><option value="required">Required</option>
              </Select>
              <p className="muted">Labels such as 46a, bis, and (2a) are entered exactly as written in the source.</p>
              {index === layers.length - 1 ? <Select label="Text editing tools" info={{ description: 'Choose plain text editing or guided sentence boundaries for the final text level.', changeability: 'review' }} name={`segmentation-${index}`} value={layer.segmentation ?? 'plain'} onChange={(event) => update(index, { segmentation: event.target.value as Layer['segmentation'] })}>
                <option value="plain">Plain text</option><option value="sentence">Sentence boundary assistance</option>
              </Select> : null}
            </fieldset>
            <fieldset>
              <legend>Public reader display</legend>
            <Select
              label="How this layer is shown"
              info={{ description: 'Display units as separate blocks or join them as running text in the public reader.', changeability: 'review' }}
              name={`presentation-${index}`}
              value={layer.presentation}
              onChange={(event) => update(index, { presentation: asOutlinePresentation(event.target.value) })}
            >
              <option value="section">Block with optional heading</option>
              <option value="concatenated">Running text (no title, joined with siblings)</option>
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
                    Show kind name ({layer.displayLabel})
                  </label><SettingInfo label="Show kind name" description="Show the level name, such as Article, before each unit in the public reader." changeability="review" /></span>
                </div>
                <div className="field">
                  <span className="setting-inline"><label className="field-label choice-row">
                    <input
                      type="checkbox"
                      checked={layer.showLabel}
                      disabled={layer.labelPolicy === 'none' || (layer.presentation === 'concatenated' && !['inline', 'superscript'].includes(layer.labelPlacement ?? 'before_title'))}
                      onChange={(event) => update(index, { showLabel: event.target.checked })}
                    />{' '}
                    Show literal legal label
                  </label><SettingInfo label="Show literal legal label" description="Show the exact label entered from the source next to each unit in the public reader." changeability="review" /></span>
                </div>
                <div className="field">
                  <span className="setting-inline"><label className="field-label choice-row">
                    <input
                      type="checkbox"
                      checked={layer.showTitle}
                      disabled={layer.titlePolicy === 'none' || layer.presentation === 'concatenated'}
                      onChange={(event) => update(index, { showTitle: event.target.checked })}
                    />{' '}
                    Show editorial title
                  </label><SettingInfo label="Show editorial title" description="Show editorial unit titles in the public reader when titles are allowed." changeability="review" /></span>
                </div>
              </>
            )}
              {layer.presentation === 'concatenated' ? <p className="muted">Running text hides kind names and editorial titles. Literal labels appear only inline or as superscripts; saved heading preferences return when block display is selected.</p> : null}
              {layer.titlePolicy === 'none' || layer.labelPolicy === 'none' ? <p className="muted">A name or label set to Not allowed cannot be shown in the public reader.</p> : null}
              {layer.titlePolicy === 'optional' && layer.showTitle && layer.presentation !== 'concatenated' ? <p className="muted">Untitled units place a visible label before their text.</p> : null}
              <Select label="Label placement" info={{ description: 'Place literal legal labels before or after a title, inline with text, or as a superscript where supported.', changeability: 'review' }} name={`label-placement-${index}`} value={layer.labelPlacement ?? 'before_title'} disabled={layer.labelPolicy === 'none' || (!layer.showLabel && layer.presentation !== 'concatenated')} onChange={(event) => update(index, { labelPlacement: event.target.value as Layer['labelPlacement'] })}>
                <option value="before_title" disabled={layer.presentation === 'concatenated'}>Before title</option><option value="after_title" disabled={layer.presentation === 'concatenated' || !layer.showTitle || layer.titlePolicy === 'none'}>After title</option><option value="inline" disabled={index < layers.length - 1 && !layer.allowTextAlongsideChildren}>Inline with text</option>{index === layers.length - 1 ? <option value="superscript">Superscript in text</option> : null}
              </Select>
              {!layer.showLabel && layer.presentation !== 'concatenated' ? <p className="muted">Show literal legal label to choose its placement.</p> : null}
            </fieldset>
            {index > 0 ? (
              <span className="setting-inline"><Button type="button" onClick={() => removeLayer(index)}>
                Remove level
              </Button><SettingInfo label="Remove level" description="Remove this structural level from the draft. Later structural changes require an impact check and may need a reviewed successor." changeability="review" /></span>
            ) : null}
          </li>
        ))}
      </ol>}
      <aside className="card outline-live-preview" aria-label="Live order example">
        <h2>{sampleRoots.length ? 'Proposed source sample' : 'Live order example'}</h2>
        <p className="muted">Parent text is unnumbered and belongs to its parent. Editor view scopes are selected separately in the editor.</p>
        <h3>Structure map</h3>
        {(sampleRoots.length ? sampleRoots : example ? [example] : []).map(node => <ExampleMap key={node.occurrenceId} node={node} outline={exampleOutline} />)}
        <h3>Reader preview</h3>
        <OrderedContentTree entries={(sampleRoots.length ? sampleRoots : example ? [example] : []).map(node => ({ type: 'child' as const, node }))} outline={exampleOutline} />
        {constitutionId ? <p>Occupied structure and stricter permissions are checked before saving. Changes requiring migration need a reviewed successor.</p> : null}
      </aside>
      </div>
      {guidedCreation && showErrors && outlineError ? <Alert tone="error">{outlineError}</Alert> : null}
      {impactError ? <Alert tone="error">Impact could not be checked. Retry when the content and draft services are available.</Alert> : null}
      {submitError ? <Alert tone="error">The constitution could not be saved. Try again.</Alert> : null}
      {impact ? <section aria-live="polite" className="card">
        <h2>{impact.classification === 'migration_required' ? 'Reviewed migration required' : 'Safe to save'}</h2>
        <p>{impact.affectedVersionIds.length} versions and {impact.affectedDraftSessionIds.length} drafts checked. Published structural settings remain pinned; public display changes apply live.</p>
        <ul>{impact.reasons.map((reason) => <li key={reason}>{reason}</li>)}{impact.violations.map((violation, index) => <li key={index}>{violation.field}: {violation.message}</li>)}</ul>
      </section> : null}
      <div className="form-row" hidden={guidedCreation && step === 1}>
        {(!guidedCreation || step === 2) ? <Button type="button" onClick={addLayer}>
          Add deeper layer
        </Button> : null}
        {(!guidedCreation || step === 2) ? <SettingInfo label="Add deeper layer" description="Add a nested unit level below the existing levels. Later structural changes require an impact check and may need a reviewed successor." changeability="review" /> : null}
        {(!guidedCreation || step === 2) && layers[layers.length - 1]?.kindCode === 'sentence' ? <p className="muted">New levels are added before the final sentence level.</p> : null}
        {constitutionId ? <Button type="button" onClick={checkImpact} disabled={checking}>{checking ? 'Checking impact…' : 'Preview change impact'}</Button> : null}
        {guidedCreation ? <>
          <Button type="button" onClick={() => { setStep(step === 3 ? 2 : 1); setShowErrors(false); }}>Back</Button>
          {step === 2 ? <Button type="button" variant="primary" onClick={(event) => { event.preventDefault(); advance(); }}>Continue to review</Button> : <Button variant="primary" data-create="true" disabled={submitting}>{submitting ? 'Creating…' : 'Create constitution'}</Button>}
        </> : <Button variant="primary" disabled={submitting || checking || (Boolean(constitutionId) && (!impact || impact.classification === 'migration_required' || impact.currentRevisionId !== settingsRevisionId))}>{submitting ? 'Saving…' : submitLabel}</Button>}
      </div>
    </form>
  );
}

function exampleNode(layers: Layer[], depth: number, path: string, sibling: number): OrderedNode | null {
  const level = layers[depth];
  if (!level) return null;
  const leaf = depth === layers.length - 1;
  const content: OrderedEntry[] = [];
  function text(position: string, words: string) { content.push({ type: 'text', logicalId: `${path}-${position}`, occurrenceId: `${path}-${position}`, text: words }); }
  if (leaf) text('text', sibling === 0 ? 'Everyone has the right to equal protection.' : 'The law shall protect these rights.');
  else {
    if (level.allowTextAlongsideChildren) text('before', 'The following rights are protected.');
    const first = exampleNode(layers, depth + 1, `${path}-a`, 0);
    if (first) content.push({ type: 'child', node: first });
    if (depth < 2) {
      if (level.allowTextAlongsideChildren) text('between', 'These rights apply to everyone.');
      const second = exampleNode(layers, depth + 1, `${path}-b`, 1);
      if (second) content.push({ type: 'child', node: second });
    }
    if (level.allowTextAlongsideChildren) text('after', 'The law shall uphold these guarantees.');
  }
  return { logicalId: path, revisionId: path, occurrenceId: path, kind: level.kindCode,
    label: level.labelPolicy === 'none' ? null : depth === 0 ? '46a' : sibling === 0 ? '(1)' : '(2a)',
    title: level.titlePolicy === 'none' || (level.titlePolicy === 'optional' && sibling > 0) ? null : `${level.displayLabel} example`, content };
}

function ExampleMap({ node, outline }: { node: OrderedNode; outline: ContentOutline }) {
  return <div className="outline-example-level">
    <strong>{kindByCode(outline, node.kind)?.displayLabel ?? node.kind} {node.label}</strong>
    <ol>{node.content.map((entry, index) => <li key={entry.node?.occurrenceId ?? entry.occurrenceId ?? index}>
      {entry.type === 'child' && entry.node ? <ExampleMap node={entry.node} outline={outline} /> : <><small>Unnumbered parent text</small> {entry.text}</>}
    </li>)}</ol>
  </div>;
}
