import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = join(dirname(fileURLToPath(import.meta.url)), 'generated');
mkdirSync(output, { recursive: true });

const outline = {
  kinds: [
    { kindCode: 'article', displayLabel: 'Article', showTitle: true, showKind: true },
    { kindCode: 'paragraph', displayLabel: 'Paragraph', showLabel: true },
    { kindCode: 'sentence', displayLabel: 'Sentence', presentation: 'concatenated', showLabel: false },
  ],
};
const definitions = [
  {
    isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: 'atlas-charter', constitutionTitle: 'Atlas Test Charter',
    versions: [
      { key: 'xa-2020', versionLabel: '2020', effectiveDate: '2020-01-01', numbers: Array.from({ length: 12 }, (_, i) => i + 1) },
      { key: 'xa-2022', versionLabel: '2022', effectiveDate: '2022-02-02', numbers: [...Array.from({ length: 11 }, (_, i) => i + 1), 13], predecessor: 'xa-2020' },
      { key: 'xa-2024', versionLabel: '2024', effectiveDate: '2024-03-03', numbers: [...Array.from({ length: 10 }, (_, i) => i + 1), 13, 14], predecessor: 'xa-2022' },
    ],
  },
  {
    isoCode: 'XB', countryName: 'Atlas Sample Republic', constitutionSlug: 'civic-charter', constitutionTitle: 'Civic Test Charter',
    versions: [
      { key: 'xb-2018', versionLabel: '2018', effectiveDate: '2018-04-04', numbers: Array.from({ length: 12 }, (_, i) => i + 1) },
      { key: 'xb-2023', versionLabel: '2023', effectiveDate: '2023-05-05', numbers: [...Array.from({ length: 11 }, (_, i) => i + 1), 13], predecessor: 'xb-2018' },
    ],
  },
];

const manifest = { schemaVersion: 1, namespace: 'atlas-e2e', expected: { countries: 2, constitutions: 2, versions: 5, articles: 60, amendments: 3 }, countries: [] };
for (const country of definitions) {
  const entry = { isoCode: country.isoCode, constitutionSlug: country.constitutionSlug, versions: [] };
  for (const version of country.versions) {
    const articles = version.numbers.map((number, index) => {
      const body = `${country.countryName} article ${number} in ${version.versionLabel}. ${number === 1 ? 'Dignity and civic equality protect every person.' : 'Public institutions serve the people.'}`;
      return {
        articleNumber: String(number), title: number === 1 ? 'Human dignity' : `Civic provision ${number}`, body,
        sortOrder: index + 1,
        ...(number === 1 ? { nodes: [{ kind: 'paragraph', label: '(1)', children: [{ kind: 'sentence', label: '1', body }] }] } : {}),
      };
    });
    const payload = {
      isoCode: country.isoCode, countryName: country.countryName, constitutionSlug: country.constitutionSlug,
      constitutionTitle: country.constitutionTitle, versionLabel: version.versionLabel,
      effectiveDate: version.effectiveDate, languageCode: 'en',
      sourceUrl: `https://example.org/atlas-e2e/${version.key}`, gazetteReference: `Atlas fixture ${version.versionLabel}`,
      outline, articles,
    };
    const file = `${version.key}.json`;
    writeFileSync(join(output, file), `${JSON.stringify(payload, null, 2)}\n`);
    entry.versions.push({ key: version.key, file, predecessor: version.predecessor ?? null });
  }
  manifest.countries.push(entry);
}
manifest.amendments = [
  { key: 'xa-2022-law', constitution: 'XA', source: 'xa-2020', target: 'xa-2022', title: 'Atlas Testland Civic Revision 2022', citation: 'Atlas Gazette 2022 No. 1', enactedOn: '2022-01-02', effectiveOn: '2022-02-02', articleNumber: '1' },
  { key: 'xa-2024-law', constitution: 'XA', source: 'xa-2022', target: 'xa-2024', title: 'Atlas Testland Civic Revision 2024', citation: 'Atlas Gazette 2024 No. 2', enactedOn: '2024-02-03', effectiveOn: '2024-03-03', articleNumber: '13' },
  { key: 'xb-2023-law', constitution: 'XB', source: 'xb-2018', target: 'xb-2023', title: 'Atlas Sample Civic Revision 2023', citation: 'Atlas Gazette 2023 No. 3', enactedOn: '2023-04-05', effectiveOn: '2023-05-05', articleNumber: '1' },
];
const versionEntries = manifest.countries.flatMap((country) => country.versions);
const keys = versionEntries.map((version) => version.key);
if (new Set(keys).size !== keys.length || versionEntries.length !== manifest.expected.versions) {
  throw new Error('Fixture version keys or count are invalid');
}
let articleCount = 0;
for (const version of versionEntries) {
  const payload = JSON.parse(readFileSync(join(output, version.file), 'utf8'));
  const orders = payload.articles.map((article) => article.sortOrder);
  const numbers = payload.articles.map((article) => article.articleNumber);
  if (orders.some((order, index) => order !== index + 1) || new Set(numbers).size !== numbers.length) {
    throw new Error(`Invalid article order or duplicate number in ${version.file}`);
  }
  articleCount += payload.articles.length;
}
if (articleCount !== manifest.expected.articles || manifest.amendments.length !== manifest.expected.amendments) {
  throw new Error('Fixture article or amendment count is invalid');
}
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.expected.versions} constitution version JSON files and manifest in ${output}`);
