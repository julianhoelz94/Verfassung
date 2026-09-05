import { describe, expect, it } from 'vitest';
import { constitutionIsoCode, countryToCreate } from './create-constitution';

describe('constitution country form', () => {
  it('normalizes an existing-country ISO code', () => {
    expect(constitutionIsoCode(' de ')).toBe('DE');
  });

  it('creates a country payload only when a name is provided', () => {
    expect(countryToCreate('fr', '')).toBeNull();
    expect(countryToCreate('fr', '  France  ')).toEqual({ isoCode: 'FR', name: 'France' });
  });

  it('rejects a code that is not two letters', () => {
    expect(() => constitutionIsoCode('D')).toThrow('isoCode');
    expect(() => countryToCreate('FRA', 'France')).toThrow('isoCode');
  });
});
