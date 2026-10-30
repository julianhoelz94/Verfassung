import { afterEach, expect, it, vi } from 'vitest';
import { defaultReaderPreferences } from './reader';
import { readerPreferenceSnapshot, serverReaderPreferenceSnapshot, subscribeReaderPreferences, saveReaderPreferences } from './reader-preferences';
afterEach(() => { vi.restoreAllMocks(); saveReaderPreferences(defaultReaderPreferences); localStorage.clear(); });
it('has a stable server snapshot and publishes same-tab and cross-tab changes until unsubscribed', () => {
  localStorage.clear(); expect(readerPreferenceSnapshot()).toBe(serverReaderPreferenceSnapshot());
  const changed = vi.fn(), stop = subscribeReaderPreferences(changed);
  const preferences = { ...defaultReaderPreferences, navigation:false };
  saveReaderPreferences(preferences); expect(JSON.parse(readerPreferenceSnapshot())).toEqual(preferences);
  window.dispatchEvent(new StorageEvent('storage')); expect(changed).toHaveBeenCalledTimes(2);
  stop(); window.dispatchEvent(new StorageEvent('storage')); expect(changed).toHaveBeenCalledTimes(2);
});
it('retains a preference when browser storage is disabled', () => {
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
  saveReaderPreferences({...defaultReaderPreferences,size:'20'}); expect(JSON.parse(readerPreferenceSnapshot()).size).toBe('20');
});
