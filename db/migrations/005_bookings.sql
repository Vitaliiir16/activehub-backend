CREATE TABLE bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES accounts(id),
 session_id uuid NOT NULL REFERENCES event_sessions(id), exclusive boolean NOT NULL,
 seats integer NOT NULL CHECK(seats BETWEEN 1 AND 10), comment text NOT NULL DEFAULT '' CHECK(length(comment)<=300),
 status text NOT NULL CHECK(status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED','REJECTED','CANCELLED','EXPIRED','COMPLETED')),
 base_price_minor integer NOT NULL CHECK(base_price_minor>=0), amount_due_minor integer NOT NULL CHECK(amount_due_minor>=0),
 discounts jsonb NOT NULL DEFAULT '[]', payment_method text NOT NULL CHECK(payment_method IN ('CARD','FREE')),
 deadline_at timestamptz, address_version integer NOT NULL, time_version integer NOT NULL,
 cancelled_by text, cancel_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX booking_active_user_session ON bookings(user_id,session_id) WHERE status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED');
CREATE UNIQUE INDEX booking_active_exclusive_session ON bookings(session_id) WHERE exclusive AND status IN ('PENDING','AWAITING_PAYMENT','CONFIRMED');
CREATE INDEX booking_session_status ON bookings(session_id,status);
CREATE TABLE booking_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 from_status text, to_status text NOT NULL, actor_id uuid REFERENCES accounts(id), actor_role text NOT NULL,
 reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION guard_booking_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('REJECTED','CANCELLED','EXPIRED','COMPLETED') AND NEW.status<>OLD.status THEN
 RAISE EXCEPTION 'Terminal booking status cannot change' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER booking_terminal BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_terminal();
CREATE TABLE background_runs(name text PRIMARY KEY,next_run_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,processed integer NOT NULL DEFAULT 0);
INSERT INTO background_runs(name) VALUES('bookings');
