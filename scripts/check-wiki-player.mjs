// Exercise the real generated files in Chromium without taking screenshots.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '../apps/gateway-web/node_modules/playwright/index.mjs';

const root = resolve(process.argv[2]);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/Verfassung/')) { response.writeHead(404).end(); return; }
    const path = resolve(root, pathname.slice('/Verfassung/'.length) || 'index.html');
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(path);
    const type = { '.html':'text/html', '.png':'image/png', '.mp4':'video/mp4', '.json':'application/json' }[extname(path)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type':type, 'Content-Length':data.length });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const downloads = [];
  page.on('download', value => downloads.push(value));
  await page.goto(`http://127.0.0.1:${server.address().port}/Verfassung/`);
  assert.equal(await page.locator('video[controls]').count(), 6);
  assert.equal(await page.locator('video[autoplay]').count(), 0);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height:900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  for (const video of await page.locator('video').all()) {
    const poster = await video.getAttribute('poster');
    assert.ok((await page.request.get(new URL(poster, page.url()).href)).ok());
    await video.evaluate(async element => { await element.play(); });
    await page.waitForFunction(id => document.getElementById(id).querySelector('video').currentTime > 0.1, await video.locator('..').getAttribute('id'));
    await video.evaluate(element => element.pause());
  }
  assert.equal(downloads.length, 0);
  console.log('Six clips play in the browser without downloads; layouts fit 390px and 1280px.');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
