CREATE TABLE migration_item_attempts (
    item_id UUID NOT NULL REFERENCES migration_items(id),
    attempt_number INT NOT NULL,
    actor_id UUID NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'preparing',
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    PRIMARY KEY (item_id, attempt_number)
);
