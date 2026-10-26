import type { OutlineKindWrite } from './api';
import { DEFAULT_NEW_OUTLINE } from './outline';

export type ConstitutionTemplate = 'articles' | 'sections' | 'sentences';

const article = DEFAULT_NEW_OUTLINE[0]!;
const paragraph = DEFAULT_NEW_OUTLINE[1]!;
const sentence = DEFAULT_NEW_OUTLINE[2]!;

/** Templates supply starting settings; the resulting levels remain fully editable. */
export function outlineFromTemplate(template: ConstitutionTemplate): OutlineKindWrite[] {
  if (template === 'articles') return [{ ...article, segmentation: 'plain' }];
  if (template === 'sections') return [
    { ...article, segmentation: 'plain' },
    { ...paragraph, kindCode: 'section', displayLabel: 'Section', segmentation: 'plain' },
  ];
  return [
    { ...article },
    { ...paragraph },
    { ...sentence },
  ];
}
