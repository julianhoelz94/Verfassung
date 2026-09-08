import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Chip, Pager, Toolbar, WorkflowSteps } from '../app/components/ui';

describe('Button', () => {
  it('adds ghost and sm classes', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { variant: 'ghost', size: 'sm', type: 'button' }, 'Edit'),
    );
    expect(html).toContain('btn-ghost');
    expect(html).toContain('btn-sm');
  });
});

describe('Toolbar', () => {
  it('exposes a toolbar role', () => {
    const html = renderToStaticMarkup(createElement(Toolbar, { label: 'Reading options' }, 'Contents'));
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Reading options"');
  });
});

describe('Badge', () => {
  it('uses a tone class only when the tone is not neutral', () => {
    expect(renderToStaticMarkup(createElement(Badge, { tone: 'added' }, 'Added'))).toContain('badge-added');
    expect(renderToStaticMarkup(createElement(Badge, null, 'Default'))).not.toContain('badge-');
  });
});

describe('Chip', () => {
  it('renders a link when href is set and a span otherwise', () => {
    const link = renderToStaticMarkup(createElement(Chip, { href: '/v1', active: true }, '2022'));
    expect(link).toContain('href="/v1"');
    expect(link).toContain('aria-current="true"');
    expect(renderToStaticMarkup(createElement(Chip, null, 'Filter'))).toContain('<span');
  });
});

describe('Pager', () => {
  it('omits the nav when both sides are missing', () => {
    expect(renderToStaticMarkup(createElement(Pager, {}))).toBe('');
  });

  it('renders the supplied previous and next links', () => {
    const html = renderToStaticMarkup(
      createElement(Pager, {
        previous: { href: '/a', label: 'Previous' },
        next: { href: '/b', label: 'Next' },
      }),
    );
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
    expect(html).toContain('aria-label="Pagination"');
  });
});

describe('WorkflowSteps', () => {
  it('marks completed and current workflow pills', () => {
    const html = renderToStaticMarkup(createElement(WorkflowSteps, { status: 'reviewing' }));
    expect(html).toContain('aria-label="Workflow"');
    expect(html).toContain('is-done');
    expect(html).toContain('is-current');
    expect(html).toContain('In review');
  });
});
