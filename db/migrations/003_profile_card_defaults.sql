ALTER TABLE user_profiles
  ADD COLUMN loyalty_level text NOT NULL DEFAULT 'STANDARD' CHECK (loyalty_level IN ('STANDARD','PREMIUM','CORPORATE')),
  ADD COLUMN card_locked_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  ADD COLUMN lifetime_points integer NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0);
