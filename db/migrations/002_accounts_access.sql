CREATE TABLE user_profiles (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  first_name text NOT NULL CHECK (length(first_name) BETWEEN 2 AND 50),
  last_name text NOT NULL CHECK (length(last_name) BETWEEN 2 AND 50),
  phone text NOT NULL,
  city_id uuid NOT NULL REFERENCES cities(id),
  gender text NOT NULL CHECK (gender IN ('MALE','FEMALE','UNDISCLOSED')),
  photo_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organizer_profiles (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  type text NOT NULL CHECK (type IN ('TRAINER','CLUB','VENUE','ORGANIZER')),
  phone text,
  city_id uuid NOT NULL REFERENCES cities(id),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  logo_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profile_directions (
  account_id uuid NOT NULL REFERENCES accounts(id),
  direction_id uuid NOT NULL REFERENCES directions(id),
  PRIMARY KEY (account_id,direction_id)
);
CREATE TABLE notification_settings (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  reminders_email boolean NOT NULL DEFAULT true,
  promotions_email boolean NOT NULL DEFAULT true,
  loyalty_email boolean NOT NULL DEFAULT false,
  messages_email boolean NOT NULL DEFAULT false
);
INSERT INTO notification_settings (account_id) SELECT id FROM accounts;
CREATE TABLE account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  csrf_hash text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_sessions_owner ON account_sessions(account_id);
CREATE TABLE csrf_contexts (
  token_hash text PRIMARY KEY,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
CREATE TABLE profile_images (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id),
  filename text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_profiles ADD FOREIGN KEY (photo_id) REFERENCES profile_images(id);
ALTER TABLE organizer_profiles ADD FOREIGN KEY (logo_id) REFERENCES profile_images(id);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  event_key text NOT NULL UNIQUE,
  type text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text NOT NULL,
  read_at timestamptz,
  email_status text NOT NULL CHECK (email_status IN ('NONE','QUEUED','SENT','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner ON notifications(account_id,created_at DESC);
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id),
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SENT')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION revoke_inactive_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    DELETE FROM account_sessions WHERE account_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_revoke_sessions AFTER UPDATE OF status ON accounts
  FOR EACH ROW EXECUTE FUNCTION revoke_inactive_sessions();
