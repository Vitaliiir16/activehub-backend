ALTER TABLE notification_settings ADD COLUMN loyalty_email_customized boolean NOT NULL DEFAULT false;

ALTER TABLE email_outbox DROP CONSTRAINT email_outbox_state_check;
ALTER TABLE email_outbox ADD CONSTRAINT email_outbox_state_check CHECK(state IN ('PENDING','SENT','FAILED'));
ALTER TABLE email_outbox ADD COLUMN last_error text CHECK(length(last_error)<=100);
CREATE INDEX email_outbox_due ON email_outbox(next_attempt_at) WHERE state='PENDING';

CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES accounts(id), organizer_id uuid NOT NULL REFERENCES accounts(id),
 last_seq integer NOT NULL DEFAULT 0, last_message_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,organizer_id), CHECK(user_id<>organizer_id)
);
CREATE INDEX conversations_organizer ON conversations(organizer_id,last_message_at DESC);
CREATE INDEX conversations_user ON conversations(user_id,last_message_at DESC);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL REFERENCES conversations(id), seq integer NOT NULL CHECK(seq>0),
 sender_id uuid NOT NULL REFERENCES accounts(id), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 event_id uuid REFERENCES events(id), read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversation_id,seq)
);
CREATE INDEX messages_unread ON messages(conversation_id,sender_id) WHERE read_at IS NULL;
CREATE FUNCTION guard_conversation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT role FROM accounts WHERE id=NEW.user_id)<>'USER' OR (SELECT role FROM accounts WHERE id=NEW.organizer_id)<>'ORGANIZER' THEN
 RAISE EXCEPTION 'Conversations are only between a user and an organizer' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER conversation_participants BEFORE INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION guard_conversation();
CREATE FUNCTION guard_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.conversation_id<>OLD.conversation_id OR NEW.seq<>OLD.seq OR NEW.sender_id<>OLD.sender_id OR NEW.body<>OLD.body OR NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.created_at<>OLD.created_at THEN
 RAISE EXCEPTION 'Messages cannot be edited' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER message_immutable BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION guard_message();

INSERT INTO background_runs(name) VALUES('reminders');
CREATE INDEX bookings_confirmed_session ON bookings(session_id) WHERE status='CONFIRMED';
