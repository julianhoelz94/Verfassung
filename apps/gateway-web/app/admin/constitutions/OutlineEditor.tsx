'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Button, Input, Select } from '../../components/ui';
import type { OutlineKindWrite, SettingsImpact, ContentOutline, OrderedNode, OrderedEntry } from '../../../lib/api';
import { asOutlinePresentation } from '../../../lib/outline';
import { OrderedContentTree } from '../../components/ConstitutionText';
import { saveOutlineAction, previewOutlineImpactAction } from './actions';

type Layer = OutlineKindWrite & { existing?: boolean };

type OutlineEditorProps = {
  constitutionId?: string;
  settingsRevisionId?: string;
  initial: OutlineKindWrite[];
  action?: (formData: FormData) => Promise<void>;
  submitLabel?: string;
  children?: ReactNode;
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
}: OutlineEditorProps) {
  const [layers, setLayers] = useState<Layer[]>(
    initial.map((kind) => ({ ...kind, existing: Boolean(constitutionId) })),
  );

  const [impact, setImpact] = useState<SettingsImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function checkImpact() {
    setChecking(true);
    setImpactError(false);
    try {
      const data = new FormData();
      data.set('constitutionId', constitutionId ?? '');
      data.set('outline', JSON.stringify(withoutExisting(layers)));
      setImpact(await previewOutlineImpactAction(data));
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
  return (
    <form action={action}>
      {constitutionId ? <input type="hidden" name="constitutionId" value={constitutionId} /> : null}
      {settingsRevisionId ? <input type="hidden" name="settingsRevisionId" value={settingsRevisionId} /> : null}
      {children}
      <input type="hidden" name="outline" value={JSON.stringify(withoutExisting(layers))} />
      <div className="outline-config-layout">
      <ol className="stack">
        {layers.map((layer, index) => (
          <li key={`${layer.kindCode}-${index}`} className="card">
            <p>
              Layer {index + 1}
              {index === 0 ? ' (top provision)' : ''}
              {index === layers.length - 1 ? ' · Text leaf' : ' · Structural level'}
            </p>
            <Input
              label="Label"
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
            <Input
              label="Kind code"
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
            <fieldset>
              <legend>Editor permissions</legend>
              {index < layers.length - 1 ? (
                <label className="field">
                  <span><input type="checkbox" checked={Boolean(layer.allowTextAlongsideChildren)} onChange={(event) => update(index, { allowTextAlongsideChildren: event.target.checked })} /> Allow text alongside child units</span>
                  <span className="muted">Unnumbered parent text can appear before, between, or after child units.</span>
                </label>
              ) : <p>This final level holds text and has no child units.</p>}
              <Select label="Editorial titles" name={`title-policy-${index}`} value={layer.titlePolicy ?? 'optional'} onChange={(event) => update(index, { titlePolicy: event.target.value as Layer['titlePolicy'], showTitle: event.target.value === 'none' ? false : layer.showTitle })}>
                <option value="none">Not allowed</option><option value="optional">Optional</option><option value="required">Required</option>
              </Select>
              <Select label="Literal legal labels" name={`label-policy-${index}`} value={layer.labelPolicy ?? 'optional'} onChange={(event) => update(index, { labelPolicy: event.target.value as Layer['labelPolicy'], showLabel: event.target.value === 'none' ? false : layer.showLabel })}>
                <option value="none">Not allowed</option><option value="optional">Optional</option><option value="required">Required</option>
              </Select>
              <p className="muted">Labels such as 46a, bis, and (2a) are entered exactly as written in the source.</p>
              {index === layers.length - 1 ? <Select label="Text editing tools" name={`segmentation-${index}`} value={layer.segmentation ?? 'plain'} onChange={(event) => update(index, { segmentation: event.target.value as Layer['segmentation'] })}>
                <option value="plain">Plain text</option><option value="sentence">Sentence boundary assistance</option>
              </Select> : null}
            </fieldset>
            <fieldset>
              <legend>Public reader display</legend>
            <Select
              label="How this layer is shown"
              name={`presentation-${index}`}
              value={layer.presentation}
              onChange={(event) => {
                const presentation = asOutlinePresentation(event.target.value);
                update(index, {
                  presentation,
                  showLabel: presentation === 'concatenated' ? false : layer.showLabel,
                  showTitle: presentation === 'concatenated' ? false : layer.showTitle,
                  showKind: presentation === 'concatenated' ? false : layer.showKind,
                });
              }}
            >
              <option value="section">Block with optional heading</option>
              <option value="concatenated">Running text (no title, joined with siblings)</option>
            </Select>
            {(
              <>
                <label className="field">
                  <span className="field-label">
                    <input
                      type="checkbox"
                      checked={layer.showKind}
                      onChange={(event) => update(index, { showKind: event.target.checked })}
                    />{' '}
                    Show kind name ({layer.displayLabel})
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">
                    <input
                      type="checkbox"
                      checked={layer.showLabel}
                      disabled={layer.labelPolicy === 'none'}
                      onChange={(event) => update(index, { showLabel: event.target.checked })}
                    />{' '}
                    Show literal legal label
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">
                    <input
                      type="checkbox"
                      checked={layer.showTitle}
                      disabled={layer.titlePolicy === 'none'}
                      onChange={(event) => update(index, { showTitle: event.target.checked })}
                    />{' '}
                    Show editorial title
                  </span>
                </label>
              </>
            )}
              <Select label="Label placement" name={`label-placement-${index}`} value={layer.labelPlacement ?? 'before_title'} onChange={(event) => update(index, { labelPlacement: event.target.value as Layer['labelPlacement'] })}>
                <option value="before_title">Before title</option><option value="after_title">After title</option><option value="inline">Inline with text</option>{index === layers.length - 1 ? <option value="superscript">Superscript in text</option> : null}
              </Select>
            </fieldset>
            {index > 0 ? (
              <Button type="button" onClick={() => removeLayer(index)}>
                Remove level
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <aside className="card outline-live-preview" aria-label="Live order example">
        <h2>Live order example</h2>
        <p className="muted">Parent text is unnumbered and belongs to its parent. Editor view scopes are selected separately in the editor.</p>
        <h3>Structure map</h3>
        {example ? <ExampleMap node={example} /> : null}
        <h3>Reader preview</h3>
        {example ? <OrderedContentTree entries={[{ type: 'child', node: example }]} outline={exampleOutline} /> : null}
        {constitutionId ? <p>Occupied structure and stricter permissions are checked before saving. Changes requiring migration need a reviewed successor.</p> : null}
      </aside>
      </div>
      {impactError ? <Alert tone="error">Impact could not be checked. Retry when the content and draft services are available.</Alert> : null}
      {impact ? <section aria-live="polite" className="card">
        <h2>{impact.classification === 'migration_required' ? 'Reviewed migration required' : 'Safe to save'}</h2>
        <p>{impact.affectedVersionIds.length} versions and {impact.affectedDraftSessionIds.length} drafts checked. Published structural settings remain pinned; public display changes apply live.</p>
        <ul>{impact.reasons.map((reason) => <li key={reason}>{reason}</li>)}{impact.violations.map((violation, index) => <li key={index}>{violation.field}: {violation.message}</li>)}</ul>
      </section> : null}
      <div className="form-row">
        <Button type="button" onClick={addLayer}>
          Add deeper layer
        </Button>
        {layers[layers.length - 1]?.kindCode === 'sentence' ? <p className="muted">New levels are added before the final sentence level.</p> : null}
        {constitutionId ? <Button type="button" onClick={checkImpact} disabled={checking}>{checking ? 'Checking impact…' : 'Preview change impact'}</Button> : null}
        <Button variant="primary" disabled={Boolean(constitutionId) && (!impact || impact.classification === 'migration_required' || impact.currentRevisionId !== settingsRevisionId)}>{submitLabel}</Button>
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
    title: level.titlePolicy === 'none' ? null : `${level.displayLabel} example`, content };
}

function ExampleMap({ node }: { node: OrderedNode }) {
  return <ol><li>{node.kind} {node.label}<ol>{node.content.map((entry, index) => <li key={index}>{entry.node ? <ExampleMap node={entry.node} /> : 'Unnumbered parent text'}</li>)}</ol></li></ol>;
}
