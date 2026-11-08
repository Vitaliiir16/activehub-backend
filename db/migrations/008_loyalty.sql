ALTER TABLE user_profiles ADD COLUMN base_level text NOT NULL DEFAULT 'STANDARD' CHECK(base_level IN ('STANDARD','PREMIUM'));
UPDATE user_profiles SET base_level=loyalty_level WHERE loyalty_level IN ('STANDARD','PREMIUM');

ALTER TABLE bookings ADD COLUMN loyalty_level text CHECK(loyalty_level IN ('STANDARD','PREMIUM','CORPORATE'));
ALTER TABLE bookings ADD COLUMN points_awarded integer CHECK(points_awarded>=0);

CREATE TABLE points_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES accounts(id),
 booking_id uuid REFERENCES bookings(id), delta integer NOT NULL,
 reason text NOT NULL CHECK(reason IN ('ACCRUAL','REDEEM','REVERSAL','REFUND_RESTORE','ADMIN_ADJUST')),
 note text CHECK(length(note)<=500), actor_id uuid REFERENCES accounts(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((reason='ADMIN_ADJUST')=(booking_id IS NULL)),
 CHECK(reason<>'ACCRUAL' OR delta>=0), CHECK(reason<>'REVERSAL' OR delta<=0)
);
CREATE UNIQUE INDEX points_single_accrual ON points_transactions(booking_id) WHERE reason='ACCRUAL';
CREATE UNIQUE INDEX points_single_reversal ON points_transactions(booking_id) WHERE reason='REVERSAL';
CREATE INDEX points_owner ON points_transactions(user_id,created_at);

CREATE TABLE free_visit_ledger (
 booking_id uuid PRIMARY KEY REFERENCES bookings(id), user_id uuid NOT NULL REFERENCES accounts(id),
 quota_month date NOT NULL CHECK(extract(day FROM quota_month)=1), visits integer NOT NULL CHECK(visits>0),
 returned_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX free_visits_open ON free_visit_ledger(user_id,quota_month) WHERE returned_at IS NULL;

CREATE TABLE card_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES accounts(id),
 admin_id uuid NOT NULL REFERENCES accounts(id), level text NOT NULL CHECK(level IN ('STANDARD','PREMIUM','CORPORATE')),
 locked boolean NOT NULL, reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_assignments_owner ON card_assignments(user_id,created_at);
