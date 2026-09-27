CREATE TABLE constitution_metadata_revisions (
  id UUID PRIMARY KEY,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  predecessor_id UUID REFERENCES constitution_metadata_revisions(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE constitution_slug_aliases (
  country_id UUID NOT NULL REFERENCES countries(id),
  slug TEXT NOT NULL,
  constitution_id UUID NOT NULL REFERENCES constitutions(id),
  PRIMARY KEY (country_id, slug)
);
INSERT INTO constitution_metadata_revisions(id, constitution_id, title, slug)
SELECT gen_random_uuid(), id, title, slug FROM constitutions;
INSERT INTO constitution_slug_aliases(country_id, slug, constitution_id)
SELECT country_id, slug, id FROM constitutions;
CREATE TRIGGER immutable_constitution_metadata BEFORE UPDATE OR DELETE ON constitution_metadata_revisions
FOR EACH ROW EXECUTE FUNCTION reject_settings_revision_update();

ALTER TABLE constitutions ADD COLUMN metadata_revision_id UUID REFERENCES constitution_metadata_revisions(id);
UPDATE constitutions c SET metadata_revision_id = r.id FROM constitution_metadata_revisions r WHERE r.constitution_id = c.id;
