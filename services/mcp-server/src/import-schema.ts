import { z } from 'zod';

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(512);
const nullableText = z.string().max(1_048_576).nullable().optional();

const outlineKind = z.strictObject({
  kindCode: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  displayLabel: shortText,
  presentation: z.enum(['section', 'concatenated']).optional(),
  showLabel: z.boolean().optional(),
  showTitle: z.boolean().optional(),
  showKind: z.boolean().optional(),
  allowTextAlongsideChildren: z.boolean().optional(),
  titlePolicy: z.enum(['required', 'optional', 'none']).optional(),
  labelPolicy: z.enum(['required', 'optional', 'none']).optional(),
  labelPlacement: z.enum(['before_title', 'after_title', 'inline', 'superscript']).optional(),
  segmentation: z.enum(['plain', 'sentence']).optional(),
  sentenceDelimiters: z.array(z.string().regex(/^[\p{P}\p{S}]+$/u).refine(value => [...value].length <= 8, 'Delimiter sequences may contain at most 8 characters')).max(16).refine(values => new Set(values).size === values.length, 'Delimiter sequences must be distinct').optional(),
  root: z.boolean().nullable().optional(),
  allowedChildKinds: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/)).max(32).nullable().optional(),
});
export const outlineSchema = z.strictObject({ kinds: z.array(outlineKind).min(1).max(32) }).superRefine((outline, context) => {
  outline.kinds.forEach((kind, index) => {
    const children = kind.allowedChildKinds ?? (outline.kinds[index + 1] ? [outline.kinds[index + 1]!.kindCode] : []);
    if (kind.segmentation === 'sentence' && (children.length || kind.sentenceDelimiters?.length === 0 || kind.labelPolicy === 'required' || kind.titlePolicy === 'required')) {
      context.addIssue({ code: 'custom', path: ['kinds', index, 'segmentation'], message: 'Automatic sentence creation requires a leaf level, optional or disallowed labels and titles, and at least one delimiter.' });
    }
  });
});

const textMark = z.strictObject({
  type: z.enum(['bold', 'italic', 'underline', 'strikethrough']),
  start: z.number().int().min(0), end: z.number().int().min(1),
}).refine(mark => mark.start < mark.end, 'Inline marks need a nonempty text range');

const reference = z.strictObject({
  logicalId: uuid, start: z.number().int().min(0), end: z.number().int().min(0),
  target: z.strictObject({ type: z.enum(['unit', 'footnote', 'external']), logicalId: uuid.nullable().optional(), url: z.string().url().startsWith('https://').nullable().optional(), footnoteId: uuid.nullable().optional() }),
});
const table = z.strictObject({
  caption: nullableText,
  rows: z.array(z.strictObject({
    logicalId: uuid,
    cells: z.array(z.strictObject({
      logicalId: uuid, text: z.string().max(1_048_576), header: z.boolean().optional(),
      rowSpan: z.number().int().min(1).max(100).optional(), colSpan: z.number().int().min(1).max(100).optional(),
      headers: z.array(uuid).optional(),
    })).max(10_000),
  })).max(10_000),
});

const legacyNode: z.ZodTypeAny = z.lazy(() => z.strictObject({
  kind: shortText,
  label: nullableText,
  title: nullableText,
  body: nullableText,
  children: z.array(legacyNode).max(10_000).optional(),
}));

export const orderedNode: z.ZodTypeAny = z.lazy(() => z.strictObject({
  revisionId: uuid.nullable().optional(),
  logicalId: uuid.nullable().optional(),
  predecessorRevisionId: uuid.nullable().optional(),
  kind: shortText.nullable().optional(),
  label: nullableText,
  title: nullableText,
  content: z.array(z.strictObject({
    type: z.enum(['text', 'child']),
    node: orderedNode.nullable().optional(),
    revisionId: uuid.nullable().optional(),
    logicalId: uuid.nullable().optional(),
    predecessorRevisionId: uuid.nullable().optional(),
    text: nullableText,
    lineage: z.array(uuid).max(32).optional(),
    format: z.enum(['plain', 'table', 'footnote']).nullable().optional(),
    table: table.nullable().optional(),
    footnoteLabel: nullableText,
    references: z.array(reference).max(10_000).optional(),
    marks: z.array(textMark).max(4096).optional(),
    lineBreaksBefore: z.number().int().min(0).max(16).optional(),
    annotation: z.strictObject({ kind: z.enum(['source', 'editorial', 'amendment']), attribution: nullableText, sourceUrl: z.string().url().startsWith('https://').nullable().optional(), anchorLogicalIds: z.array(uuid).max(100).optional() }).nullable().optional(),
  })).max(10_000).nullable().optional(),
  lineage: z.array(uuid).max(32).optional(),
}));

const sourceFields = {
  isoCode: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  jurisdictionId: uuid.optional(),
  countryName: shortText.optional(),
  constitutionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  constitutionTitle: shortText,
  languageCode: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).optional(),
  sourceUrl: z.string().url().startsWith('https://').max(2048).nullable().optional(),
  gazetteReference: shortText.nullable().optional(),
};

export const setupProposalSchema = z.strictObject({
  ...sourceFields,
  predecessorConstitutionId: uuid.nullable().optional(),
  interim: z.boolean().optional(),
  outline: outlineSchema,
  sampleRoots: z.array(orderedNode).max(20).optional(),
});

export const importPayloadSchema = z.strictObject({
  ...sourceFields,
  sourceEvidence: z.strictObject({ description: z.string().max(50_000).nullable().optional(), dateWording: nullableText, datePrecision: z.enum(['unknown', 'year', 'month', 'day', 'range', 'uncertain']).optional(), coverage: nullableText, statusWording: nullableText, attribution: nullableText }).nullable().optional(),
  expectedCounts: z.record(z.enum(['units', 'textEntries', 'tables', 'cells', 'footnotes', 'references', 'documents']), z.number().int().min(0)).nullable().optional(),
  versionLabel: shortText,
  effectiveDate: z.iso.date().nullable().optional(),
  predecessorVersionId: uuid.nullable().optional(),
  hopKind: z.enum(['initial', 'legal', 'editorial_correction', 'legal_amendment', 'official_errata']).nullable().optional(),
  constitutionId: uuid.nullable().optional(),
  settingsRevisionId: uuid.nullable().optional(),
  outline: outlineSchema.nullable().optional(),
  articles: z.array(z.strictObject({
    articleNumber: z.string().min(1).max(512),
    title: z.string().max(1000),
    body: z.string().max(1_048_576).optional(),
    sortOrder: z.number().int().min(1),
    nodes: z.array(legacyNode).max(10_000).optional(),
  })).max(10_000).optional(),
  roots: z.array(orderedNode).max(10_000).optional(),
});
