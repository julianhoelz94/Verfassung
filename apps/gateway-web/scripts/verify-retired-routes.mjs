import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
const retired = [
  '/legacy/page',
  '/constitutions/[id]/amendments/page',
  '/countries/[code]/constitution-timeline/page',
  '/admin/import/[jobId]/page',
  '/versions/[versionId]/units/[unitId]/page',
];
const unexpected = Object.keys(manifest).filter(route => retired.includes(route) || route.includes('/archive/'));
if (unexpected.length) throw new Error(`Retired routing was compiled: ${unexpected.join(', ')}`);
console.log('Verified: all retired routes and archived sources are absent from the production route manifest.');
