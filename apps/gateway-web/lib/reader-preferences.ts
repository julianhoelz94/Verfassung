import { defaultReaderPreferences, type ReaderPreferences } from './reader';

const key = 'ca_reader_preferences_v1', changed = 'ca:reader-preferences';
const defaults = JSON.stringify(defaultReaderPreferences);
let memory: string | undefined;

export function readerPreferenceSnapshot(): string {
  try { return localStorage.getItem(key) ?? memory ?? defaults; } catch { return memory ?? defaults; }
}
export function serverReaderPreferenceSnapshot(): string { return defaults; }
export function subscribeReaderPreferences(listener: () => void): () => void {
  window.addEventListener('storage', listener); window.addEventListener(changed, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(changed, listener); };
}
export function saveReaderPreferences(preferences: ReaderPreferences): void {
  const value = JSON.stringify(preferences);
  try { localStorage.setItem(key, value); memory = undefined; } catch { memory = value; }
  window.dispatchEvent(new Event(changed));
}
