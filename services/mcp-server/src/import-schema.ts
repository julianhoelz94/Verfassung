import { z } from 'zod';

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(512);
const nullableText = z.string().max(1_048_576).nullable().optional();

const outlineKind = z.object({
  kindCode: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  displayLabel: shortText,
  presentation: z.enum(['section', 'concatenated']).optional(),
  showLabel: z.boolean().optional(),
  showTitle: z.boolean().optional(),
  showKind: z.boolean().optional(),
  allowTextAlongsideChildren: z.boolean().optional(),
  titlePolicy: z.enum(['required', 'optional', 'forbidden']).optional(),
  labelPolicy: z.enum(['required', 'optional', 'forbidden']).optional(),
  labelPlacement: z.enum(['before_title', 'after_title', 'inline', 'superscript']).optional(),
  segmentation: z.enum(['plain', 'sentence']).optional(),
});
export const outlineSchema = z.object({ kinds: z.array(outlineKind).min(1).max(32) });

const legacyNode: z.ZodTypeAny = z.lazy(() => z.object({
  kind: shortText,
  label: nullableText,
  title: nullableText,
  body: nullableText,
  children: z.array(legacyNode).max(10_000).optional(),
}));

const orderedNode: z.ZodTypeAny = z.lazy(() => z.object({
  revisionId: uuid.nullable().optional(),
  logicalId: uuid.nullable().optional(),
  predecessorRevisionId: uuid.nullable().optional(),
  kind: shortText.nullable().optional(),
  label: nullableText,
  title: nullableText,
  content: z.array(z.object({
    type: z.enum(['text', 'child']),
    node: orderedNode.nullable().optional(),
    revisionId: uuid.nullable().optional(),
    logicalId: uuid.nullable().optional(),
    predecessorRevisionId: uuid.nullable().optional(),
    text: nullableText,
    lineage: z.array(uuid).max(32).optional(),
  })).max(10_000).nullable().optional(),
  lineage: z.array(uuid).max(32).optional(),
}));

const sourceFields = {
  isoCode: z.string().regex(/^[A-Za-z]{2}$/),
  countryName: shortText,
  constitutionSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  constitutionTitle: shortText,
  languageCode: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).optional(),
  sourceUrl: z.string().url().startsWith('https://').max(2048).nullable().optional(),
  gazetteReference: shortText.nullable().optional(),
};

export const setupProposalSchema = z.object({
  ...sourceFields,
  predecessorConstitutionId: uuid.nullable().optional(),
  interim: z.boolean().optional(),
  outline: outlineSchema,
  sampleRoots: z.array(orderedNode).max(20).optional(),
});

export const importPayloadSchema = z.object({
  ...sourceFields,
  versionLabel: shortText,
  effectiveDate: z.iso.date().nullable().optional(),
  predecessorVersionId: uuid.nullable().optional(),
  hopKind: z.enum(['initial', 'legal', 'editorial_correction', 'legal_amendment', 'official_errata']).nullable().optional(),
  constitutionId: uuid.nullable().optional(),
  settingsRevisionId: uuid.nullable().optional(),
  outline: outlineSchema.nullable().optional(),
  articles: z.array(z.object({
    articleNumber: shortText,
    title: z.string().max(1000),
    body: z.string().max(1_048_576).optional(),
    sortOrder: z.number().int().min(0),
    nodes: z.array(legacyNode).max(10_000).optional(),
  })).max(10_000).optional(),
  roots: z.array(orderedNode).max(10_000).optional(),
});
