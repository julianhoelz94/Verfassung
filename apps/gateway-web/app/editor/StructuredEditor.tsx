"use client";
import {
  useStructuredEditorModel,
  type StructuredEditorProps,
} from "./structured-editor-model";
import { renderStructuredEditor } from "./structured-editor-presentation";
/** Keeps the public editor component and hook order stable while delegating its commands and presentation. */
export function StructuredEditor(props: StructuredEditorProps) {
  const model = useStructuredEditorModel(props);
  return renderStructuredEditor(model);
}
