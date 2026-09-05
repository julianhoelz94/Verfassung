'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import type { OutlineKindWrite } from '../../../lib/api';
import { asOutlinePresentation } from '../../../lib/outline';
import { saveOutlineAction } from './actions';

type Layer = OutlineKindWrite & { existing?: boolean };

type OutlineEditorProps = {
  constitutionId?: string;
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
      ...current,
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
    setLayers((current) => current.filter((_, i) => i !== index));
  }

  return (
    <form action={action}>
      {constitutionId ? <input type="hidden" name="constitutionId" value={constitutionId} /> : null}
      {children}
      <input type="hidden" name="outline" value={JSON.stringify(withoutExisting(layers))} />
      <ol className="stack">
        {layers.map((layer, index) => (
          <li key={`${layer.kindCode}-${index}`} className="card">
            <p>
              Layer {index + 1}
              {index === 0 ? ' (top provision)' : ''}
              {index === layers.length - 1 ? ' (deepest)' : ''}
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
                      onChange={(event) => update(index, { showLabel: event.target.checked })}
                    />{' '}
                    Show number/label
                  </span>
                </label>
                <label className="field">
                  <span className="field-label">
                    <input
                      type="checkbox"
                      checked={layer.showTitle}
                      onChange={(event) => update(index, { showTitle: event.target.checked })}
                    />{' '}
                    Show title (name each node, e.g. a paragraph heading)
                  </span>
                </label>
              </>
            ) : (
              <p className="muted">Sibling nodes of this kind are concatenated in the public text.</p>
            )}
            {index > 0 ? (
              <Button type="button" onClick={() => removeLayer(index)}>
                Remove layer (text moves into the parent)
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="form-row">
        <Button type="button" onClick={addLayer}>
          Add deeper layer
        </Button>
        <Button variant="primary">{submitLabel}</Button>
      </div>
    </form>
  );
}
