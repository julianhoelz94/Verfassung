# 0007 — Curated comparisons across constitution identities

Status: Accepted for Sprint 64 (MIG-9)

Catalog owns authored comparison columns, topic correspondences, provenance, and
review/publication state. Content remains the authority for exact passages in
immutable published snapshots. Document owns the captured original comparison
and its pinned file revision. Gateway composes these APIs using the shared reader.

Each column identifies a distinct constitution and an exact published snapshot.
Topic rows explicitly list one or more logical units per column or mark that
column as having no counterpart. Article numbers never imply correspondence.
Review pins the authored mapping; a later transcription revision marks the mapping
as needing review while the original snapshot quotations remain unchanged.

Creation, review and publication use separate current editorial roles. Import
credentials may stage a proposed comparison through Ingestion but cannot create,
review or publish Catalog records directly. The original source document must be
publicly readable at its pinned revision before a comparison can be published.
No additional service or cross-service database relationship is introduced.
