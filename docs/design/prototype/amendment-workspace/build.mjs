import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gateway = path.resolve(here, '../../../../apps/gateway-web');
const require = createRequire(path.join(gateway, 'package.json'));
const { build } = require('esbuild');
const result = await build({
  entryPoints: [path.join(here, 'mock.tsx')],
  bundle: true,
  write: false,
  outfile: path.join(here, 'bundle.js'),
  jsx: 'automatic',
  minify: true,
  alias: { '@gateway': gateway },
  nodePaths: [path.join(gateway, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'shared-css-modules', setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async ({ path: filename }) => ({
      contents: await readFile(filename, 'utf8'), loader: 'local-css', resolveDir: path.dirname(filename),
    }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Amendment workspace design mock</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await writeFile(path.join(here, 'mock.html'), html);
console.log('Built standalone mock from shared gateway templates, components and tokens.');
