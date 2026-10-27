import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SearchFilters } from './SearchFilters';
import type { SearchFacets } from '../../lib/api';

let host: HTMLDivElement;
let root: Root;
const facets: SearchFacets = {
  countries: [{ code: 'DE', countryName: 'Germany', count: 1 }], dates: [],
  jurisdictions: [{ id: 'national', name: 'Germany', countryCode: 'DE', historical: false, count: 1 },
    { id: 'region', name: 'Historical region', countryCode: '', historical: true, count: 1 }],
  versions: [{ id: 'law', label: '2022', constitutionTitle: 'Basic Law', countryCode: 'DE', jurisdictionId: 'national', count: 1 },
    { id: 'charter', label: '1849', constitutionTitle: 'Charter', countryCode: '', jurisdictionId: 'region', count: 1 }],
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('submits only compatible owner/version fields after switching from a country to a historical region', async () => {
  await act(async () => root.render(<form><SearchFilters facets={facets} country="DE" jurisdictionId="national" versionId="law" effectiveDate="" /></form>));
  const jurisdiction = host.querySelector<HTMLSelectElement>('[name="jurisdictionId"]')!;
  await act(async () => { jurisdiction.value = 'region'; Simulate.change(jurisdiction); });
  const form = new FormData(host.querySelector('form')!);
  expect(form.get('country')).toBe(''); expect(form.get('jurisdictionId')).toBe('region'); expect(form.get('versionId')).toBe('');
  expect([...host.querySelectorAll<HTMLSelectElement>('[name="versionId"] option')].map(option => option.value)).toEqual(['', 'charter']);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('cleared');
});
