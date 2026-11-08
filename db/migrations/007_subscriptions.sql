CREATE TABLE subscription_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organizer_id uuid NOT NULL REFERENCES accounts(id),
 name text NOT NULL, type text NOT NULL CHECK(type IN ('ONE_TIME','MONTHLY','CORPORATE')), description text NOT NULL,
 price_minor integer NOT NULL CHECK(price_minor BETWEEN 0 AND 10000000), validity_days integer NOT NULL CHECK(validity_days BETWEEN 1 AND 36500),
 visits_limit integer CHECK(visits_limit>0), scope text NOT NULL CHECK(scope IN ('ALL_EVENTS','DIRECTIONS')),
 direction_ids uuid[] NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(type<>'ONE_TIME' OR visits_limit=1), CHECK(type<>'CORPORATE' OR (visits_limit IS NOT NULL AND visits_limit>=2)),
 CHECK((scope='ALL_EVENTS' AND cardinality(direction_ids)=0) OR (scope='DIRECTIONS' AND cardinality(direction_ids)>0))
);
CREATE INDEX subscription_plans_owner ON subscription_plans(organizer_id,status);
CREATE TABLE user_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES accounts(id), plan_id uuid NOT NULL REFERENCES subscription_plans(id),
 plan_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXHAUSTED','EXPIRED')),
 starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>starts_at), visits_left integer CHECK(visits_left>=0),
 company_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_owner ON user_subscriptions(user_id,status);
ALTER TABLE bookings DROP CONSTRAINT bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check CHECK(payment_method IN ('CARD','FREE','SUBSCRIPTION'));
ALTER TABLE bookings ADD COLUMN subscription_id uuid REFERENCES user_subscriptions(id);
CREATE TABLE subscription_visit_ledger (
 booking_id uuid PRIMARY KEY REFERENCES bookings(id), subscription_id uuid NOT NULL REFERENCES user_subscriptions(id),
 visits integer NOT NULL CHECK(visits>0), returned_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN subscription_id uuid REFERENCES user_subscriptions(id);
ALTER TABLE payments ADD COLUMN plan_id uuid REFERENCES subscription_plans(id);
ALTER TABLE payments DROP CONSTRAINT payments_amount_minor_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_minor_check CHECK(amount_minor>=0);
ALTER TABLE payments ADD CONSTRAINT payment_subject CHECK((booking_id IS NOT NULL AND plan_id IS NULL AND subscription_id IS NULL) OR (booking_id IS NULL AND plan_id IS NOT NULL));
CREATE FUNCTION preserve_subscription_terms() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.plan_snapshot IS DISTINCT FROM OLD.plan_snapshot OR NEW.starts_at<>OLD.starts_at OR NEW.expires_at<>OLD.expires_at OR NEW.user_id<>OLD.user_id OR NEW.plan_id<>OLD.plan_id OR NEW.company_name IS DISTINCT FROM OLD.company_name THEN
 RAISE EXCEPTION 'Purchase terms are immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_subscription_terms BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION preserve_subscription_terms();
INSERT INTO background_runs(name) VALUES('subscription-expiry');
