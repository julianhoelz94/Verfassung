import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(new URL('../../../../apps/gateway-web/package.json', import.meta.url));
const { build } = require('esbuild');
const result = await build({
  entryPoints: [fileURLToPath(new URL('./preview.tsx', import.meta.url))], outfile: 'preview.js', bundle: true,
  write: false, minify: true, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [fileURLToPath(new URL('../../../../apps/gateway-web/node_modules', import.meta.url))],
});
const javascript = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const output = process.argv[2] || join(tmpdir(), 'document-attachment-preview.html');
await writeFile(output, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Document attachment · Interactive preview</title><style>${css}</style><body><div id="root"></div><script>${javascript.replaceAll('</script', '<\\/script')}</script></body></html>`);
process.stdout.write(output + '\n');
