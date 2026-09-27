CREATE TABLE content_snapshots (
  version_id UUID PRIMARY KEY,
  constitution_id UUID,
  settings_revision_id UUID,
  generation BIGINT NOT NULL DEFAULT 0,
  legacy_dirty BOOLEAN NOT NULL DEFAULT FALSE,
  canonical BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE content_node_revisions (
  id UUID PRIMARY KEY,
  logical_id UUID NOT NULL,
  origin_version_id UUID NOT NULL,
  predecessor_id UUID REFERENCES content_node_revisions(id),
  kind TEXT NOT NULL,
  label TEXT,
  title TEXT,
  sealed BOOLEAN NOT NULL DEFAULT FALSE,
  order_inferred BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE content_text_revisions (
  id UUID PRIMARY KEY,
  logical_id UUID NOT NULL,
  origin_version_id UUID NOT NULL,
  predecessor_id UUID REFERENCES content_text_revisions(id),
  text TEXT NOT NULL,
  lineage UUID[] NOT NULL DEFAULT '{}'
);
CREATE TABLE content_revision_entries (
  parent_revision_id UUID NOT NULL REFERENCES content_node_revisions(id),
  position INT NOT NULL CHECK (position >= 0),
  text_revision_id UUID REFERENCES content_text_revisions(id),
  child_revision_id UUID REFERENCES content_node_revisions(id),
  CHECK ((text_revision_id IS NULL) <> (child_revision_id IS NULL)),
  PRIMARY KEY (parent_revision_id, position),
  UNIQUE (parent_revision_id, child_revision_id),
  UNIQUE (parent_revision_id, text_revision_id)
);
CREATE TABLE content_snapshot_roots (
  version_id UUID NOT NULL REFERENCES content_snapshots(version_id),
  position INT NOT NULL CHECK (position >= 0),
  revision_id UUID NOT NULL REFERENCES content_node_revisions(id),
  PRIMARY KEY (version_id, position),
  UNIQUE (version_id, revision_id)
);
CREATE TABLE content_occurrences (
  id UUID PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES content_snapshots(version_id),
  logical_id UUID NOT NULL,
  node_revision_id UUID REFERENCES content_node_revisions(id),
  text_revision_id UUID REFERENCES content_text_revisions(id),
  predecessor_id UUID REFERENCES content_occurrences(id),
  CHECK ((node_revision_id IS NULL) <> (text_revision_id IS NULL)),
  UNIQUE (version_id, logical_id)
);

INSERT INTO content_snapshots(version_id) SELECT DISTINCT version_id FROM content_nodes;
INSERT INTO content_node_revisions(id, logical_id, origin_version_id, kind, label, title, order_inferred)
SELECT n.id, n.id, n.version_id, n.kind, COALESCE(n.label, n.number), n.title,
  n.body IS NOT NULL AND EXISTS (SELECT 1 FROM content_nodes child WHERE child.parent_id = n.id)
FROM content_nodes n;
-- Walk explicit predecessor links only; equal text does not establish logical identity.
WITH RECURSIVE lineage AS (
  SELECT id, id AS ancestor_id, predecessor_id, ARRAY[id] AS path FROM content_nodes
  UNION ALL
  SELECT l.id, p.id, p.predecessor_id, l.path || p.id
  FROM lineage l JOIN content_nodes p ON p.id = l.predecessor_id WHERE NOT p.id = ANY(l.path)
), oldest AS (
  SELECT DISTINCT ON (id) id, ancestor_id FROM lineage ORDER BY id, cardinality(path) DESC
)
UPDATE content_node_revisions r SET logical_id = o.ancestor_id FROM oldest o WHERE o.id = r.id;
UPDATE content_node_revisions r SET predecessor_id = n.predecessor_id
FROM content_nodes n WHERE n.id = r.id AND EXISTS (SELECT 1 FROM content_node_revisions p WHERE p.id = n.predecessor_id);
INSERT INTO content_text_revisions(id, logical_id, origin_version_id, text)
SELECT md5(id::text || ':body')::uuid, md5(logical_id::text || ':body')::uuid, origin_version_id, n.body
FROM content_node_revisions r JOIN content_nodes n USING(id) WHERE n.body IS NOT NULL;
INSERT INTO content_revision_entries(parent_revision_id, position, text_revision_id)
SELECT id, 0, md5(id::text || ':body')::uuid FROM content_nodes WHERE body IS NOT NULL;
INSERT INTO content_revision_entries(parent_revision_id, position, child_revision_id)
SELECT n.parent_id,
  (row_number() OVER (PARTITION BY n.parent_id ORDER BY n.sort_order, n.id) - 1)::int + CASE WHEN p.body IS NULL THEN 0 ELSE 1 END,
  n.id
FROM content_nodes n JOIN content_nodes p ON p.id = n.parent_id;
INSERT INTO content_snapshot_roots(version_id, position, revision_id)
SELECT version_id, (row_number() OVER (PARTITION BY version_id ORDER BY sort_order, id) - 1)::int, id
FROM content_nodes WHERE parent_id IS NULL;
INSERT INTO content_occurrences(id, version_id, logical_id, node_revision_id)
SELECT id, origin_version_id, logical_id, id FROM content_node_revisions;
INSERT INTO content_occurrences(id, version_id, logical_id, text_revision_id)
SELECT id, origin_version_id, logical_id, id FROM content_text_revisions;
UPDATE content_occurrences o SET predecessor_id = n.predecessor_id
FROM content_nodes n WHERE n.id = o.id AND EXISTS (SELECT 1 FROM content_occurrences p WHERE p.id = n.predecessor_id);

CREATE FUNCTION reject_content_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Content revisions are immutable'; END;
$$;
UPDATE content_node_revisions SET sealed = TRUE;
CREATE FUNCTION guard_node_revision_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT OLD.sealed AND NEW.sealed
     AND (to_jsonb(OLD) - 'sealed') = (to_jsonb(NEW) - 'sealed') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Node revisions are immutable';
END;
$$;
CREATE TRIGGER immutable_node_revision BEFORE UPDATE OR DELETE ON content_node_revisions
FOR EACH ROW EXECUTE FUNCTION guard_node_revision_seal();
CREATE TRIGGER immutable_text_revision BEFORE UPDATE OR DELETE ON content_text_revisions
FOR EACH ROW EXECUTE FUNCTION reject_content_revision_mutation();

CREATE FUNCTION guard_entry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT sealed FROM content_node_revisions WHERE id = NEW.parent_revision_id) THEN
    RAISE EXCEPTION 'Cannot append entries to a sealed revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sealed_revision_entries BEFORE INSERT ON content_revision_entries
FOR EACH ROW EXECUTE FUNCTION guard_entry_insert();
CREATE TRIGGER immutable_revision_entries BEFORE UPDATE OR DELETE ON content_revision_entries
FOR EACH ROW EXECUTE FUNCTION reject_content_revision_mutation();
