CREATE TABLE anonymous_browsing_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    allowed BOOLEAN NOT NULL DEFAULT TRUE,
    per_ip_requests INTEGER NOT NULL DEFAULT 600 CHECK (per_ip_requests > 0),
    per_ip_window_value INTEGER NOT NULL DEFAULT 1 CHECK (per_ip_window_value > 0),
    per_ip_window_unit TEXT NOT NULL DEFAULT 'minutes' CHECK (per_ip_window_unit IN ('minutes', 'hours', 'days')),
    total_requests INTEGER NOT NULL DEFAULT 6000 CHECK (total_requests > 0),
    total_window_value INTEGER NOT NULL DEFAULT 1 CHECK (total_window_value > 0),
    total_window_unit TEXT NOT NULL DEFAULT 'minutes' CHECK (total_window_unit IN ('minutes', 'hours', 'days')),
    revision BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO anonymous_browsing_settings (id) VALUES (TRUE);
