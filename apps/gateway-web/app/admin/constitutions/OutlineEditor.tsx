'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import type { OutlineKindWrite } from '../../../lib/api';
import { asOutlinePresentation, nodeHeading } from '../../../lib/outline';
import { saveOutlineAction } from './actions';

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

  function update(index: number, patch: Partial<Layer>) {
    setLayers((current) => current.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
  }

  function addLayer() {
    setLayers((current) => [
      ...current.map((layer) => ({ ...layer, segmentation: 'plain' as const })),
      {
        kindCode: `layer-${current.length + 1}`,
        displayLabel: 'New layer',
        presentation: 'section',
        showLabel: true,
        showTitle: true,
        showKind: false,
        existing: false,
      },
    ]);
  }

  function removeLayer(index: number) {
    if (index === 0) {
      return;
    }
    setLayers((current) => current.filter((_, i) => i !== index).map((layer, i, next) => ({ ...layer, allowTextAlongsideChildren: i === next.length - 1 ? false : layer.allowTextAlongsideChildren })));
  }

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
              {index === layers.length - 1 ? <Select label="Text editing tools" name={`segmentation-${index}`} value={layer.segmentation ?? (layer.kindCode === 'sentence' ? 'sentence' : 'plain')} onChange={(event) => update(index, { segmentation: event.target.value as Layer['segmentation'] })}>
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
            {layer.presentation === 'section' ? (
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
            ) : (
              <p className="muted">Sibling nodes of this kind are concatenated in the public text.</p>
            )}
              <Select label="Label placement" name={`label-placement-${index}`} value={layer.labelPlacement ?? 'before_title'} onChange={(event) => update(index, { labelPlacement: event.target.value as Layer['labelPlacement'] })}>
                <option value="before_title">Before title</option><option value="after_title">After title</option><option value="inline">Inline with text</option>
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
        <OutlineOrderExample layers={layers} />
        {constitutionId ? <p>Occupied structure and stricter permissions are checked before saving. Changes requiring migration need a reviewed successor.</p> : null}
      </aside>
      </div>
      <div className="form-row">
        <Button type="button" onClick={addLayer}>
          Add deeper layer
        </Button>
        <Button variant="primary">{submitLabel}</Button>
      </div>
    </form>
  );
}

function OutlineOrderExample({ layers, depth = 0 }: { layers: Layer[]; depth?: number }) {
  const level = layers[depth];
  if (!level) return null;
  const leaf = depth === layers.length - 1;
  const heading = nodeHeading({ ...level, sortOrder: depth + 1, mayHoldText: leaf || Boolean(level.allowTextAlongsideChildren), mayHoldChildren: !leaf, allowedChildKinds: [] }, { kind: level.kindCode, label: depth === 0 ? '46a' : '(2a)', number: null, title: level.titlePolicy === 'none' ? null : 'Example title' });
  return <section className="outline-example-level">
    {heading ? <h3>{heading}</h3> : <p className="muted">{level.displayLabel}</p>}
    {leaf ? <p>Everyone has the right to equal protection.</p> : <>
      {level.allowTextAlongsideChildren ? <p><small>Unnumbered parent text · before children</small><br />The following rights are protected.</p> : null}
      <OutlineOrderExample layers={layers} depth={depth + 1} />
      {level.allowTextAlongsideChildren ? <p><small>Unnumbered parent text · between children</small><br />These rights apply to everyone.</p> : null}
      <OutlineOrderExample layers={layers} depth={depth + 1} />
      {level.allowTextAlongsideChildren ? <p><small>Unnumbered parent text · after children</small><br />The law shall uphold these guarantees.</p> : null}
    </>}
  </section>;
}
