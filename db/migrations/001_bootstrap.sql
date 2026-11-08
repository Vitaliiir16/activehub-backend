CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(email) <= 254),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('USER', 'ORGANIZER', 'ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'DELETED')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email_unique ON accounts (lower(email));

CREATE TABLE admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES accounts(id),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  created_by uuid REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE directions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_level_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL UNIQUE CHECK (level IN ('STANDARD', 'PREMIUM', 'CORPORATE')),
  display_name text NOT NULL,
  points_threshold integer CHECK (points_threshold >= 0),
  points_multiplier numeric(8, 2) NOT NULL CHECK (points_multiplier >= 0),
  discount_percent numeric(5, 2) NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
  free_visits_per_month integer NOT NULL DEFAULT 0 CHECK (free_visits_per_month >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_free_directions (
  level_id uuid NOT NULL REFERENCES loyalty_level_config(id),
  direction_id uuid NOT NULL REFERENCES directions(id),
  PRIMARY KEY (level_id, direction_id)
);

CREATE TABLE loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  base_points_per_booking integer NOT NULL CHECK (base_points_per_booking >= 0),
  points_per_uah numeric(10, 4) NOT NULL CHECK (points_per_uah >= 0),
  redeem_rate numeric(10, 4) NOT NULL CHECK (redeem_rate >= 0),
  max_redeem_percent numeric(5, 2) NOT NULL CHECK (max_redeem_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
