CREATE TABLE deployment_setup (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    schema_version INTEGER NOT NULL DEFAULT 1,
    bootstrap_admin_id UUID,
    completed_at TIMESTAMPTZ,
    legacy_installation BOOLEAN NOT NULL DEFAULT FALSE,
    mail_deferred BOOLEAN NOT NULL DEFAULT FALSE,
    access_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_languages TEXT[] NOT NULL DEFAULT '{}',
    default_language TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Existing installations retain access. New databases have no users when this runs.
INSERT INTO deployment_setup(id, completed_at, legacy_installation)
SELECT TRUE, CASE WHEN EXISTS(SELECT 1 FROM users) THEN NOW() END, EXISTS(SELECT 1 FROM users);
