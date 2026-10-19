'use client';

import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { Button, Input } from './ui';
import { saveNodeTitleAction } from './node-actions';

type NodeTitleFormProps = {
  nodeId: string;
  title: string | null;
  label: string;
  returnTo: string;
};

export function NodeTitleForm({ nodeId, title, label, returnTo }: NodeTitleFormProps) {
  return (
    <form action={saveNodeTitleAction} className="node-title-form print-hide">
      <input type="hidden" name="nodeId" value={nodeId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Input
        id={`node-title-${nodeId}`}
        name="title"
        label={`Title for ${label}`}
        defaultValue={title ?? ''}
      />
      <Button><T value={ui.components.nodetitleform.saveTitle} /></Button>
    </form>
  );
}
