'use client';

import { T, ui } from '../components/TranslationProvider';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';
const DraftState = createContext({ dirty: false, setDirty: (_value: boolean) => {} });
export function EditorDraftState({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <DraftState.Provider value={{ dirty, setDirty }}>{children}</DraftState.Provider>;
}
export const useDraftState = () => useContext(DraftState);
export function SubmitReviewButton({ disabled }: { disabled: boolean }) {
  const { dirty } = useDraftState();
  return <><Button disabled={disabled || dirty}><T value={ui.editor.editordraftstate.submitForReview} /></Button>{dirty ? <p role="status"><T value={ui.editor.editordraftstate.saveTheCanvasChangesBeforeSubmittingFor} /></p> : null}</>;
}
