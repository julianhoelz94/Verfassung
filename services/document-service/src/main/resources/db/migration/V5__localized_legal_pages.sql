ALTER TABLE legal_pages DROP CONSTRAINT legal_pages_page_key_check;
ALTER TABLE legal_pages ADD CONSTRAINT legal_pages_page_key_check
    CHECK (page_key IN ('impressum', 'datenschutz', 'impressum_en', 'datenschutz_en'));

-- Older published imprint revisions may contain an address in their prose.
-- New revisions use the separately published contact record.
ALTER TABLE legal_page_revisions ADD COLUMN separate_contact BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE legal_imprint_details (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    draft_revision INTEGER NOT NULL DEFAULT 0,
    published_revision INTEGER,
    CHECK (draft_revision >= 0),
    CHECK (published_revision IS NULL OR published_revision BETWEEN 1 AND draft_revision)
);

INSERT INTO legal_imprint_details (id) VALUES (TRUE);

CREATE TABLE legal_imprint_detail_revisions (
    revision INTEGER PRIMARY KEY CHECK (revision > 0),
    name TEXT NOT NULL,
    street_address TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    CHECK (length(btrim(name)) > 0),
    CHECK (length(btrim(street_address)) > 0),
    CHECK (length(btrim(postal_code)) > 0),
    CHECK (length(btrim(city)) > 0),
    CHECK (length(btrim(country)) > 0),
    CHECK (length(btrim(email)) > 0)
);
