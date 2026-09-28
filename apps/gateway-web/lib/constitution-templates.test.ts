import { describe, expect, it } from 'vitest';
import { outlineFromTemplate } from './constitution-templates';

describe('constitution starting structures', () => {
  it('makes every template a valid editable outline with one text leaf', () => {
    for (const template of ['articles', 'sections', 'sentences'] as const) {
      const outline = outlineFromTemplate(template);
      expect(outline.map((kind) => kind.kindCode)).toEqual(
        template === 'articles' ? ['article'] : template === 'sections' ? ['article', 'section'] : ['article', 'paragraph', 'sentence'],
      );
      expect(outline.at(-1)?.segmentation).toBe(template === 'sentences' ? 'sentence' : 'plain');
      outline[0]!.displayLabel = 'Changed';
      expect(outlineFromTemplate(template)[0]!.displayLabel).toBe('Article');
    }
  });
});
