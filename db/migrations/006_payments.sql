CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
 amount_minor integer NOT NULL CHECK(amount_minor>0), status text NOT NULL CHECK(status IN ('SUCCEEDED','FAILED','REFUNDED')),
 card_last4 text NOT NULL CHECK(card_last4 ~ '^[0-9]{4}$'), refunded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='REFUNDED')=(refunded_at IS NOT NULL))
);
CREATE UNIQUE INDEX payment_single_charge ON payments(booking_id) WHERE status IN ('SUCCEEDED','REFUNDED');
CREATE TABLE refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
 amount_minor integer NOT NULL CHECK(amount_minor>0), reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
