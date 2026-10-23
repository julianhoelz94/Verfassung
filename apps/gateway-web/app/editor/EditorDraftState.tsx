'use client';

import { T } from '../components/TranslationProvider';
import { ui, type UiMessage } from '../../lib/messages';
import { workflowUi } from '../../lib/workflow-messages';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';
const DraftState = createContext({ dirty: false, textDirty: false, detailsDirty: false, setDirty: (_value: boolean) => {}, setDetailsDirty: (_value: boolean) => {} });
export function EditorDraftState({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  return <DraftState.Provider value={{ dirty: dirty || detailsDirty, textDirty: dirty, detailsDirty, setDirty, setDetailsDirty }}>{children}</DraftState.Provider>;
}
export const useDraftState = () => useContext(DraftState);
export function SubmitReviewButton({ disabled, requirements = [] }: { disabled: boolean; requirements?: { message: UiMessage; href: string }[] }) {
  const { dirty, textDirty, detailsDirty } = useDraftState();
  return <><Button disabled={disabled || dirty} aria-describedby={dirty || requirements.length ? 'submit-review-help' : undefined}><T value={ui.editor.editordraftstate.submitForReview} /></Button>{dirty || requirements.length ? <div id="submit-review-help" role="status"><p><T value={workflowUi.beforeSubmitting} /></p><ul>{textDirty ? <li><T value={ui.editor.editordraftstate.saveTheCanvasChangesBeforeSubmittingFor} /></li> : null}{detailsDirty ? <li><a href="#editor-change-record"><T value={workflowUi.saveDetails} /></a></li> : null}{requirements.map((requirement, index) => <li key={index}><a href={requirement.href}><T value={requirement.message} /></a></li>)}</ul></div> : null}</>;
}
