import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Chip, Input, Select, TextArea, Pager, Toolbar, WorkflowSteps } from '../app/components/ui';

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

describe('shared form field accessibility', () => {
  for (const Control of [Input, Select, TextArea]) {
    it(`${Control.name} keeps the label, help, error and existing description associated`, () => {
      document.body.innerHTML = renderToStaticMarkup(createElement(Control, {
        id: 'field', name: 'field', label: 'Name', help: 'Use the published name.', error: 'A name is required.', 'aria-describedby': 'external-description',
      }));
      const control = document.getElementById('field')!;
      expect(document.querySelector('label')?.htmlFor).toBe(control.id);
      expect(control.getAttribute('aria-invalid')).toBe('true');
      expect(control.getAttribute('aria-describedby')?.split(' ')).toEqual(['external-description', 'field-help', 'field-error']);
      expect(document.getElementById('field-help')?.textContent).toBe('Use the published name.');
      expect(document.getElementById('field-error')?.textContent).toBe('A name is required.');
    });
  }

  it('generates distinct labelled controls when no id or name is supplied', () => {
    document.body.innerHTML = renderToStaticMarkup(createElement('form', null,
      createElement(Input, { label: 'First', help: 'First help' }), createElement(Input, { label: 'Second', help: 'Second help' }),
    ));
    const controls = [...document.querySelectorAll('input')];
    expect(new Set(controls.map(control => control.id)).size).toBe(2);
    for (const control of controls) {
      expect([...document.querySelectorAll('label')].some(label => label.htmlFor === control.id)).toBe(true);
      expect(document.getElementById(control.getAttribute('aria-describedby')!)).not.toBeNull();
    }
  });
});
