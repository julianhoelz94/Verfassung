import { describe, expect, it } from 'vitest';
import axe from 'axe-core';
import { primaryNavLinks } from './nav';

async function runAxe(bodyHtml: string) {
  document.documentElement.lang = 'en';
  document.title = 'Constitution Atlas';
  document.body.innerHTML = bodyHtml;
  return axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
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
      </header>
      <main id="main-content">
        <h1>Countries</h1>
      </main>
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
    `);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
