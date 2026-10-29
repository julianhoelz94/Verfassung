CREATE TABLE swagger_access_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO swagger_access_settings (id, enabled) VALUES (TRUE, TRUE);
