CREATE TABLE legal_pages (
    page_key TEXT PRIMARY KEY CHECK (page_key IN ('impressum', 'datenschutz')),
    draft_revision INTEGER NOT NULL DEFAULT 0,
    published_revision INTEGER,
    CHECK (draft_revision >= 0),
    CHECK (published_revision IS NULL OR published_revision BETWEEN 1 AND draft_revision)
);

CREATE TABLE legal_page_revisions (
    page_key TEXT NOT NULL REFERENCES legal_pages(page_key),
    revision INTEGER NOT NULL CHECK (revision > 0),
    content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    PRIMARY KEY (page_key, revision)
);

CREATE TABLE legal_page_events (
    id UUID PRIMARY KEY,
    page_key TEXT NOT NULL REFERENCES legal_pages(page_key),
    revision INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('draft_saved', 'published')),
    actor_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (page_key, revision) REFERENCES legal_page_revisions(page_key, revision)
);

CREATE INDEX legal_page_events_page_idx ON legal_page_events(page_key, occurred_at DESC);
