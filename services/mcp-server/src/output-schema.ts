import { z } from 'zod';

const uuid = z.string().uuid();
const bounded = z.string().max(1_048_576);
const url = z.string().url();
const next = z.number().int().min(0).nullable();
const cursor = z.string().max(1024).nullable();
const country = z.object({ isoCode: z.string().length(2), name: z.string().max(512), versionCount: z.number().int().min(0) });

export const countryListOutput = z.object({ countries: z.array(country).max(50), total: z.number().int().min(0), nextOffset: next, nextCursor: cursor });
export const constitutionListOutput = z.object({
  countryCode: z.string().length(2), countryName: z.string().max(512),
  constitutions: z.array(z.object({ id: uuid, slug: z.string().max(120), title: z.string().max(512) })).max(50),
  total: z.number().int().min(0), nextOffset: next, nextCursor: cursor,
});
export const versionListOutput = z.object({
  constitutionId: uuid,
  versions: z.array(z.object({ id: uuid, versionLabel: z.string().max(512), effectiveDate: z.string().nullable().optional(), languageCode: z.string().max(35), sourceUrl: url.nullable().optional(), gazetteReference: z.string().nullable().optional() }).passthrough()).max(50),
  total: z.number().int().min(0), nextOffset: next, nextCursor: cursor,
});
export const outlineOutput = z.object({ versionId: uuid, constitutionId: uuid, versionLabel: z.string().max(512), outline: z.object({ kinds: z.array(z.object({ kindCode: z.string(), displayLabel: z.string() }).passthrough()).max(32) }).passthrough(), url: url.nullable() });
export const unitListOutput = z.object({
  versionId: uuid, versionLabel: z.string().max(512), units: z.array(z.object({ id: uuid, label: z.string(), title: z.string(), kind: z.string().optional() })).max(50),
  nextOffset: next, nextCursor: cursor, url: url.nullable(),
});
export const readUnitOutput = z.object({
  versionId: uuid, unitId: uuid, kind: z.string(), label: z.string(), title: z.string(), text: bounded.max(20_000), offset: z.number().int().min(0), nextOffset: next,
  childLogicalIds: z.array(uuid), url: url.nullable(),
});
export const resolveUnitOutput = z.object({
  versionId: uuid, logicalId: uuid, kind: z.string(), pathLabels: z.array(z.string()), deepLink: z.string(), text: bounded.max(20_000), offset: z.number().int().min(0), nextOffset: next, url: url.nullable(),
}).passthrough();
export const searchOutput = z.object({
  query: z.string().max(200), results: z.object({
    hits: z.array(z.object({ articleId: uuid, versionId: uuid, countryCode: z.string().length(2), url }).passthrough()).max(50),
    total: z.number().int().min(0), limit: z.number().int().min(1).max(50), offset: z.number().int().min(0),
    indexGeneration: z.number().int().min(0), nextOffset: next, nextCursor: cursor,
  }).passthrough(),
});

const error = z.object({ code: z.string().max(100), message: z.string().max(1000) });
const job = z.object({ id: uuid, status: z.string().max(64), errors: z.array(error) }).passthrough();
const proposal = z.object({ id: uuid, ownerId: uuid, status: z.string().max(64), payload: z.record(z.string(), z.unknown()), constitutionId: uuid.nullable(), settingsRevisionId: uuid.nullable(), confirmedBy: uuid.nullable() }).passthrough();
const upload = z.object({ id: uuid, batchId: uuid, status: z.string().max(64), totalBytes: z.number().int().min(0), chunkBytes: z.number().int().min(1), missingChunks: z.array(z.number().int().min(0).max(49)).max(50), itemId: uuid.nullable() }).passthrough();
export const importSchemaOutput = z.object({
  schemaVersion: z.string().max(32), settingsGuidance: z.array(z.object({ id: z.string(), field: z.string(), description: z.string(), changeability: z.string() }).passthrough()),
  workflow: z.array(z.string()), required: z.array(z.string()), uploadLimits: z.object({ directToolBytes: z.number().int(), chunkBytes: z.number().int(), chunkedItemBytes: z.number().int(), receivingBatchBytes: z.number().int(), maxItemsPerBatch: z.number().int() }),
  sourceFields: z.record(z.string(), z.string()), structure: z.record(z.string(), z.unknown()), notes: z.array(z.string()),
});
export const findConstitutionOutput = z.object({ exists: z.boolean(), countryCode: z.string().length(2), countryName: z.string().optional(), constitutionId: uuid.optional(), title: z.string().optional(), slug: z.string().optional(), settingsRevisionId: uuid.optional(), outline: z.record(z.string(), z.unknown()).optional(), settingsGuidance: z.array(z.unknown()).optional() });
export const setupProposalCreatedOutput = z.object({ proposalId: uuid, status: z.string(), settingsGuidance: z.array(z.unknown()), previewUrl: url });
export const setupProposalOutput = proposal;
export const importSetupOutput = z.object({ exists: z.boolean(), countryCode: z.string().length(2), constitutionId: uuid.optional(), title: z.string().optional(), settingsRevisionId: uuid.optional(), outline: z.record(z.string(), z.unknown()).nullable(), settingsGuidance: z.array(z.unknown()).optional() });
export const importStagedOutput = z.object({ jobId: uuid, status: z.string(), errors: z.array(error), reviewUrl: url });
export const batchCreatedOutput = z.object({ batchId: uuid, status: z.string(), reviewUrl: url });
export const batchItemOutput = z.object({ batchId: uuid, itemId: uuid, status: z.string(), errors: z.array(error), reviewUrl: url });
export const batchOutput = z.object({ id: uuid, status: z.string(), items: z.array(job).max(100) });
export const uploadOutput = upload;
export const completedUploadOutput = upload.extend({ reviewUrl: url.nullable() });
export const jobOutput = job;
