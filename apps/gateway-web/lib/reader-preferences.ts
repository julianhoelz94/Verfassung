import { defaultReaderPreferences, type ReaderPreferences } from './reader';

export type PreferenceScope = "reader" | "editor";
const keys = {
  reader: "ca_reader_preferences_v1",
  editor: "ca_editor_view_preferences_v1",
};
const changed = 'ca:reader-preferences';
const defaults = JSON.stringify(defaultReaderPreferences);
const memory = new Map<PreferenceScope, string>();

export function readerPreferenceSnapshot(
  scope: PreferenceScope = "reader",
): string {
  const key = keys[scope];
  try { return localStorage.getItem(key) ?? memory.get(scope) ?? defaults; } catch { return memory.get(scope) ?? defaults; }
}
export function serverReaderPreferenceSnapshot(): string { return defaults; }
export function subscribeReaderPreferences(listener: () => void): () => void {
  window.addEventListener('storage', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener); };
}
export function saveReaderPreferences(preferences: ReaderPreferences,
  scope: PreferenceScope = "reader",
): void {
  const key = keys[scope];
  const value = JSON.stringify(preferences);
  try { localStorage.setItem(key, value); memory.delete(scope); } catch { memory.set(scope, value); }
  window.dispatchEvent(new Event(changed));
}
