CREATE TABLE admin_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL REFERENCES accounts(id), action text NOT NULL CHECK(length(action) BETWEEN 3 AND 60),
 target_type text NOT NULL CHECK(target_type IN ('USER','ORGANIZER','EVENT','BOOKING','PLAN','CITY','DIRECTION')),
 target_id uuid NOT NULL, reason text CHECK(length(reason)<=500), details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_target ON admin_audit_log(target_type,target_id,created_at);
CREATE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'The audit log is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

CREATE UNIQUE INDEX cities_name_unique ON cities(lower(name));
CREATE UNIQUE INDEX directions_name_unique ON directions(lower(name));
