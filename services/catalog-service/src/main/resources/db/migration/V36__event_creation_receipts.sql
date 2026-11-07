CREATE TABLE event_creation_receipts (
 actor_id UUID NOT NULL,
 operation_id UUID NOT NULL,
 event_id UUID NOT NULL,
 request_hash TEXT NOT NULL,
 PRIMARY KEY(actor_id, operation_id)
);
