CREATE TABLE demo_seed_runs (
 namespace text PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 account_ids uuid[] NOT NULL
);
