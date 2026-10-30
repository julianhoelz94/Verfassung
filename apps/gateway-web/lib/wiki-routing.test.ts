import { expect, it } from 'vitest';
import { wikiEditPath, wikiPublicPath } from './wiki-routing';

it('keeps historical jurisdictions on their own page even when a country code is supplied', () => {
  expect(wikiPublicPath({ targetType: 'jurisdiction', targetId: 'former-region', code: 'DE' })).toBe('/jurisdictions/former-region');
  expect(wikiEditPath({ targetType: 'jurisdiction', targetId: 'former-region' }, { saved: '1' })).toBe('/editor/wiki/jurisdiction/former-region?saved=1');
});

it('keeps regional constitution wikis within their jurisdiction context', () => {
  const owner = { targetType: 'constitution' as const, targetId: 'charter', jurisdictionId: 'region' };
  expect(wikiPublicPath(owner)).toBe('/jurisdictions/region/constitutions/charter');
  expect(wikiEditPath(owner, { historyPage: '2' })).toBe('/editor/wiki/constitution/charter?jurisdictionId=region&historyPage=2');
});
