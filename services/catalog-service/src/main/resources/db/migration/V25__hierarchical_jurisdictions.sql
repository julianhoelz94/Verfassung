CREATE TABLE jurisdictions (
  id UUID PRIMARY KEY,
  parent_id UUID REFERENCES jurisdictions(id),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{0,31}$'),
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_id IS DISTINCT FROM id),
  CHECK (kind <> 'country' OR parent_id IS NULL),
  UNIQUE NULLS NOT DISTINCT (parent_id, slug)
);

CREATE UNIQUE INDEX jurisdictions_parent_code_key
  ON jurisdictions (parent_id, code) NULLS NOT DISTINCT WHERE code IS NOT NULL;

INSERT INTO jurisdictions(id, slug, name, kind, code, created_at)
SELECT id, lower(iso_code), name, 'country', iso_code, created_at FROM countries;

CREATE FUNCTION sync_country_jurisdiction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO jurisdictions(id, slug, name, kind, code)
  VALUES (NEW.id, lower(NEW.iso_code), NEW.name, 'country', NEW.iso_code)
  ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, code = EXCLUDED.code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER country_jurisdiction_sync AFTER INSERT OR UPDATE OF iso_code, name ON countries
FOR EACH ROW EXECUTE FUNCTION sync_country_jurisdiction();

ALTER TABLE constitutions ADD COLUMN jurisdiction_id UUID REFERENCES jurisdictions(id);
UPDATE constitutions SET jurisdiction_id = country_id;
ALTER TABLE constitutions ALTER COLUMN jurisdiction_id SET NOT NULL;
ALTER TABLE constitutions ALTER COLUMN country_id DROP NOT NULL;
ALTER TABLE constitutions DROP CONSTRAINT constitutions_country_id_slug_key;
ALTER TABLE constitutions ADD CONSTRAINT constitutions_jurisdiction_slug_key UNIQUE (jurisdiction_id, slug);

CREATE FUNCTION set_constitution_jurisdiction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.jurisdiction_id := COALESCE(NEW.jurisdiction_id, NEW.country_id);
  IF EXISTS (SELECT 1 FROM countries WHERE id = NEW.jurisdiction_id) THEN
    NEW.country_id := COALESCE(NEW.country_id, NEW.jurisdiction_id);
  END IF;
  IF NEW.country_id IS NOT NULL AND NEW.country_id IS DISTINCT FROM NEW.jurisdiction_id THEN
    RAISE EXCEPTION 'Country and jurisdiction ownership must agree' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER constitution_jurisdiction_owner BEFORE INSERT OR UPDATE OF country_id, jurisdiction_id ON constitutions
FOR EACH ROW EXECUTE FUNCTION set_constitution_jurisdiction();

ALTER TABLE constitution_slug_aliases DROP CONSTRAINT constitution_slug_aliases_country_id_fkey;
ALTER TABLE constitution_slug_aliases RENAME COLUMN country_id TO jurisdiction_id;
ALTER TABLE constitution_slug_aliases ADD FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id);
