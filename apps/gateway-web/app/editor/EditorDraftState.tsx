'use client';
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
  return <><Button disabled={disabled || dirty}>Submit for review</Button>{dirty ? <p role="status">Save the canvas changes before submitting for review.</p> : null}</>;
}
