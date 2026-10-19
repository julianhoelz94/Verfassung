CREATE TABLE content_translation_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    provider TEXT NOT NULL DEFAULT 'off' CHECK (provider IN ('off', 'google', 'deepl')),
    shared_key_cipher TEXT
);
INSERT INTO content_translation_settings (id) VALUES (TRUE);

CREATE TABLE user_content_translation_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    always_translate BOOLEAN NOT NULL DEFAULT FALSE,
    google_key_cipher TEXT
);

CREATE TABLE content_translation_google_usage (
    billing_month CHAR(7) PRIMARY KEY,
    reserved_characters INTEGER NOT NULL DEFAULT 0 CHECK (reserved_characters BETWEEN 0 AND 500000)
);

CREATE TABLE content_translation_google_reservations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    characters INTEGER NOT NULL CHECK (characters > 0)
);
CREATE INDEX content_translation_google_reservations_time_idx ON content_translation_google_reservations(reserved_at);

CREATE TABLE content_translation_cache (
    scope TEXT NOT NULL,
    provider TEXT NOT NULL,
    source_hash CHAR(64) NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, provider, source_hash, source_language, target_language)
);
