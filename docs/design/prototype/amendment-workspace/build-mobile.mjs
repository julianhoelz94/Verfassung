import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2]);
const [template, mock] = await Promise.all([
  readFile(path.join(here, 'mobile.fragment.html'), 'utf8'),
  readFile(path.join(here, 'mock.html')),
]);
const fragment = template.replace('__ATLAS_MOBILE_PAYLOAD__', mock.toString('base64'));
if (Buffer.byteLength(fragment) > 1000000) throw new Error('Mobile preview exceeds the inline size limit');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, fragment);
console.log(`Created interactive mobile preview (${Buffer.byteLength(fragment)} bytes).`);
