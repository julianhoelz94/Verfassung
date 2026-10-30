/** Synthetic public collections for directory/owner and immutable-snapshot acceptance. */
export function countryDirectoryFixtures(country) {
  const root = { id: country.id, parentId: null, name: country.name, slug: 'de', kind: 'country', code: 'DE', historical: false, existedFrom: null, existedUntil: null };
  const region = { ...root, id: '07100000-0000-4000-8000-000000000001', parentId: root.id, name: 'Example Region', slug: 'example-region', kind: 'region', code: 'DE-EX' };
  const former = { ...region, id: '07100000-0000-4000-8000-000000000002', name: 'Former Province', slug: 'former-province', code: null, historical: true, existedUntil: '1950-01-01' };
  const city = { ...region, id: '07100000-0000-4000-8000-000000000003', parentId: region.id, name: 'Nested City', slug: 'nested-city', kind: 'city', code: null };
  const template = country.constitutions[0].versions[0];
  function version(id, label, effectiveDate, extra = {}) { return { ...template, id, versionLabel: label, effectiveDate, legalVersionId: id, currentVersionId: id, predecessorVersionId: null, latestPublished: false, listing: 'public', hopKind: 'legal', ...extra }; }
  const regionOld = version('07200000-0000-4000-8000-000000000001', '2000', '2000-01-01');
  const regionNew = version('07200000-0000-4000-8000-000000000002', '2020', '2020-01-01', { predecessorVersionId: regionOld.id, latestPublished: true, currentVersionId: '07200000-0000-4000-8000-000000000003' });
  const correction = version(regionNew.currentVersionId, '2020 correction', '2020-01-01', { legalVersionId: regionNew.id, predecessorVersionId: regionNew.id, hopKind: 'editorial_correction', listing: 'staff' });
  const privateVersion = version('07200000-0000-4000-8000-000000000099', 'PRIVATE DRAFT', '2030-01-01', { listing: 'staff' });
  const regional = { id: '07300000-0000-4000-8000-000000000001', title: 'Example Regional Constitution', slug: 'example-regional', lifecycleStatus: 'in_force', latestVersionId: privateVersion.id, versions: [regionOld, regionNew, correction, privateVersion], contentOutline: country.constitutions[0].contentOutline };
  const historic = { id: '07300000-0000-4000-8000-000000000002', title: 'Earlier Regional Constitution', slug: 'earlier-regional', lifecycleStatus: 'repealed', versions: [version('07200000-0000-4000-8000-000000000004', '1900', '1900-01-01')] };
  regional.predecessorConstitutionId = historic.id;
  const national = { id: '07300000-0000-4000-8000-000000000003', title: 'Archived National Charter', slug: 'archived-national', lifecycleStatus: 'repealed', versions: [version('07200000-0000-4000-8000-000000000005', '1800', '1800-01-01')] };
  const provincial = { id: '07300000-0000-4000-8000-000000000004', title: 'Former Provincial Charter', slug: 'provincial', lifecycleStatus: 'repealed', versions: [version('07200000-0000-4000-8000-000000000006', '1920', '1920-01-01')] };
  const municipal = { id: '07300000-0000-4000-8000-000000000005', title: 'Municipal Charter', slug: 'municipal', lifecycleStatus: 'suspended', versions: [version('07200000-0000-4000-8000-000000000007', '2010', '2010-01-01')] };
  const hidden = { ...regional, id: '07300000-0000-4000-8000-000000000099', title: 'PRIVATE CONSTITUTION', versions: [privateVersion] };
  const countryData = { ...country, constitutions: [...country.constitutions, national, hidden] };
  const lifecycle = new Map([regional, historic, national, provincial, municipal].map(constitution => [constitution.id, [{ id: `07800000-0000-4000-8000-${constitution.id.slice(-12)}`, constitutionId: constitution.id, eventType: constitution.lifecycleStatus === 'repealed' ? 'repealed' : 'commenced', eventDate: constitution.versions[0].effectiveDate, dateCertainty: 'exact', sourceUrl: null, note: `Recorded event for ${constitution.title}` }]]));
  const regions = new Map([
    [root.id, { jurisdiction: root, ancestors: [], children: [region, former], constitutions: countryData.constitutions }],
    [region.id, { jurisdiction: region, ancestors: [root], children: [city], constitutions: [regional, historic, hidden] }],
    [former.id, { jurisdiction: former, ancestors: [root], children: [], constitutions: [provincial] }],
    [city.id, { jurisdiction: city, ancestors: [root, region], children: [], constitutions: [municipal] }],
  ]);
  const versions = new Map();
  for (const [owner, constitutions] of [[null, [national]], [region.id, [regional, historic]], [former.id, [provincial]], [city.id, [municipal]]]) {
    for (const constitution of constitutions) for (const value of constitution.versions) {
      if (value.id === privateVersion.id) continue;
      versions.set(value.id, { ...value, constitutionId: constitution.id, jurisdictionId: owner, countryCode: owner ? null : 'DE', publicationStatus: 'published' });
    }
  }
  function units(snapshot) {
    const corrected = snapshot.id === correction.id;
    const text = snapshot.id === regionOld.id ? 'Regional rights are protected.' : corrected ? 'Regional rights are protected equally. Corrected spelling.' : 'Regional rights are protected equally.';
    const logicalId = '07400000-0000-4000-8000-000000000001';
    return [{ id: '07500000-0000-4000-8000-' + snapshot.id.slice(-12), logicalId, versionId: snapshot.id, kind: 'article', articleNumber: '1', label: '1', title: 'Regional rights', sortOrder: 1, body: text, children: [], content: [{ type: 'text', logicalId: '07400000-0000-4000-8000-000000000002', revisionId: snapshot.id, occurrenceId: '07600000-0000-4000-8000-' + snapshot.id.slice(-12), text }] }];
  }
  return { region, former, city, regional, historic, national, regionOld, regionNew, correction, nationalEvents: lifecycle.get(national.id),
    response(pathname, unavailable = []) {
      if (pathname === '/api/catalog/countries/DE') return { status: 200, body: countryData };
      const jurisdictionMatch = /^\/api\/catalog\/jurisdictions\/([^/]+)$/.exec(pathname);
      if (jurisdictionMatch && regions.has(jurisdictionMatch[1])) return { status: unavailable.includes(jurisdictionMatch[1]) ? 503 : 200, body: regions.get(jurisdictionMatch[1]) };
      const versionMatch = /^\/api\/catalog\/versions\/([^/]+)(\/settings|\/outline|\/reader-settings)?$/.exec(pathname);
      if (versionMatch && versions.has(versionMatch[1])) return { status: 200, body: versionMatch[2] === '/settings' ? { settingsRevisionId: null, outline: country.constitutions[0].contentOutline } : versionMatch[2] ? country.constitutions[0].contentOutline : versions.get(versionMatch[1]) };
      const unitsMatch = /^\/api\/content\/versions\/([^/]+)\/units(?:\/(.+))?$/.exec(pathname);
      if (unitsMatch && versions.has(unitsMatch[1])) {
        const items = units(versions.get(unitsMatch[1]));
        return { status: 200, body: unitsMatch[2] ? items[0] : items };
      }
      const eventsMatch = /^\/api\/catalog\/constitutions\/([^/]+)\/lifecycle-events$/.exec(pathname);
      if (eventsMatch && lifecycle.has(eventsMatch[1])) return { status: 200, body: lifecycle.get(eventsMatch[1]) };
      const registerMatch = /^\/api\/amendment\/constitutions\/([^/]+)\/amendment-register$/.exec(pathname);
      if (registerMatch && (lifecycle.has(registerMatch[1]) || country.constitutions.some(constitution => constitution.id === registerMatch[1]))) return { status: 200, body: { constitutionId: registerMatch[1], items: [], total: 0, offset: 0, limit: 20 } };
      return undefined;
    },
  };
}
