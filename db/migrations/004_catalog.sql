CREATE TABLE events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizer_id uuid NOT NULL REFERENCES accounts(id),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120), description text NOT NULL CHECK(length(description) BETWEEN 1 AND 5000),
 kind text NOT NULL CHECK(kind IN ('TRAINING','SECTION','HALL_RENTAL','TEAM_SEARCH','EVENT')),
 direction_id uuid NOT NULL REFERENCES directions(id), city_id uuid NOT NULL REFERENCES cities(id), address text NOT NULL,
 skill text NOT NULL CHECK(skill IN ('BEGINNER','INTERMEDIATE','ADVANCED','ANY')),
 age text NOT NULL CHECK(age IN ('CHILDREN','TEENS','ADULTS','SENIORS','ANY')),
 price_minor integer NOT NULL CHECK(price_minor BETWEEN 0 AND 10000000), promo_price_minor integer CHECK(promo_price_minor>=0 AND promo_price_minor<price_minor),
 promo_until timestamptz, seats_per_session integer NOT NULL CHECK(seats_per_session BETWEEN 1 AND 1000),
 confirmation_mode text NOT NULL CHECK(confirmation_mode IN ('AUTO','MANUAL')),
 trainer_name text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED','CANCELLED','BLOCKED','DELETED')),
 address_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((promo_price_minor IS NULL) = (promo_until IS NULL))
);
CREATE INDEX events_catalog ON events(status,city_id,direction_id);
CREATE INDEX events_owner ON events(organizer_id);
CREATE TABLE event_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 seats_total integer NOT NULL CHECK(seats_total BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CANCELLED','COMPLETED')),
 is_deleted boolean NOT NULL DEFAULT false, time_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_sessions_future ON event_sessions(event_id,starts_at) WHERE NOT is_deleted;
CREATE TABLE event_photos (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id), filename text NOT NULL UNIQUE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 7), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE idempotency_secret (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), secret text NOT NULL
);
INSERT INTO idempotency_secret(secret) VALUES (gen_random_uuid()::text || gen_random_uuid()::text);
CREATE TABLE idempotency_records (
 actor_id uuid NOT NULL REFERENCES accounts(id), scope text NOT NULL, key uuid NOT NULL,
 fingerprint text NOT NULL, response_status integer NOT NULL, response_body jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,scope,key)
);
