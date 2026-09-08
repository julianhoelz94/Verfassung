import { describe, expect, it } from 'vitest';
import * as axeCore from 'axe-core';
import { primaryNavLinks } from './nav';

const axeRun =
  typeof axeCore.run === 'function'
    ? axeCore.run.bind(axeCore)
    : (axeCore as unknown as { default: { run: typeof axeCore.run } }).default.run;

async function runAxe(bodyHtml: string) {
  document.documentElement.lang = 'en';
  document.title = 'Constitution Atlas';
  document.body.innerHTML = bodyHtml;
  return axeRun(document, { rules: { 'color-contrast': { enabled: false } } });
}

const publicNav = primaryNavLinks(null)
  .map((link) => `<a href="${link.href}">${link.label}</a>`)
  .join('');
const editorNav = primaryNavLinks({ email: 'editor@example.local', roles: ['editor'] })
  .map((link) => `<a href="${link.href}" aria-current="page">${link.label}</a>`)
  .join('');

describe('accessible application shell', () => {
  it('has no axe violations on a public page', async () => {
    const results = await runAxe(`
      <a href="#main-content">Skip to main content</a>
      <header>
        <a href="/">Constitution Atlas</a>
        <nav aria-label="Primary">${publicNav}</nav>
        <form role="search" action="/search" method="get">
          <label for="header-q">Search articles</label>
          <input id="header-q" type="search" name="q" />
          <button type="submit">Search</button>
        </form>
      </header>
      <main id="main-content">
        <h1>Countries</h1>
      </main>
      <footer>
        <nav aria-label="Footer">
          <a href="/about">About</a>
        </nav>
      </footer>
    `);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  it('has no axe violations on an editor page with a form', async () => {
    const results = await runAxe(`
      <a href="#main-content">Skip to main content</a>
      <header>
        <a href="/">Constitution Atlas</a>
        <nav aria-label="Primary">${editorNav}</nav>
      </header>
      <main id="main-content">
        <h1>Editor</h1>
        <p role="alert">Invalid email or password.</p>
        <form>
          <label for="title">Title</label>
          <input id="title" name="title" />
          <label for="body">Article text</label>
          <textarea id="body" name="body"></textarea>
          <button type="submit">Save draft</button>
        </form>
      </main>
      <footer>
        <nav aria-label="Footer">
          <a href="/about">About</a>
        </nav>
      </footer>
    `);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
