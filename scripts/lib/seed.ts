import type { PoolClient } from "pg";
import { hashPassword } from "./password";

export const cities = ["Kyiv", "Lviv", "Kharkiv", "Odesa", "Dnipro", "Zaporizhzhia", "Vinnytsia", "Ivano-Frankivsk", "Ternopil", "Chernivtsi", "Poltava", "Cherkasy", "Zhytomyr", "Lutsk", "Uzhhorod"];
export const directions = ["Football", "Basketball", "Volleyball", "Tennis", "Table tennis", "Yoga", "Pilates", "Fitness", "CrossFit", "Swimming", "Running", "Martial arts", "Dance", "Cycling", "Climbing", "Active leisure"];
const code = (name: string) => name.toLowerCase().replaceAll(" ", "-");

export function seedConfiguration(env: Record<string, string | undefined> = process.env) {
  const email = env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.INITIAL_ADMIN_PASSWORD;
  const displayName = env.INITIAL_ADMIN_NAME?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("INITIAL_ADMIN_EMAIL must be a valid email");
  if (!password || password.length < 8 || password.length > 256 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("INITIAL_ADMIN_PASSWORD must contain 8-256 characters, a letter and a digit");
  if (!displayName || displayName.length < 2 || displayName.length > 100) throw new Error("INITIAL_ADMIN_NAME must contain 2-100 characters");
  if (env.SEED_DEMO === "true") throw new Error("Demo data is planned for later delivery; SEED_DEMO must be false");
  return { email, password, displayName };
}

export async function seed(client: PoolClient, config: ReturnType<typeof seedConfiguration>) {
  for (const name of cities) await client.query("INSERT INTO cities (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING", [code(name), name]);
  for (const name of directions) await client.query("INSERT INTO directions (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING", [code(name), name]);

  const levels = [
    ["STANDARD", "Standard", null, "1.00", "0.00", 0],
    ["PREMIUM", "Premium", 500, "1.50", "5.00", 4],
    ["CORPORATE", "Corporate", null, "2.00", "10.00", 0],
  ];
  let premiumCreated = false;
  for (const values of levels) {
    const inserted = await client.query(`INSERT INTO loyalty_level_config
      (level, display_name, points_threshold, points_multiplier, discount_percent, free_visits_per_month)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (level) DO NOTHING RETURNING level`, values);
    if (values[0] === "PREMIUM" && inserted.rowCount) premiumCreated = true;
  }
  if (premiumCreated) await client.query(`INSERT INTO loyalty_free_directions (level_id, direction_id)
    SELECT l.id, d.id FROM loyalty_level_config l, directions d WHERE l.level = 'PREMIUM' AND d.code = 'swimming'
    ON CONFLICT DO NOTHING`);
  await client.query(`INSERT INTO loyalty_rules (base_points_per_booking, points_per_uah, redeem_rate, max_redeem_percent)
    VALUES (10, 0.1, 0.5, 30) ON CONFLICT (singleton) DO NOTHING`);

  const existing = await client.query<{ id: string; role: string }>("SELECT id, role FROM accounts WHERE lower(email) = $1", [config.email]);
  if (existing.rowCount && existing.rows[0].role !== "ADMIN") throw new Error("Configured initial admin email belongs to another role");
  const bootstrap = await client.query("SELECT id FROM admin_profiles WHERE created_by IS NULL LIMIT 1");
  if (!existing.rowCount && !bootstrap.rowCount) {
    const hash = await hashPassword(config.password);
    const account = await client.query<{ id: string }>("INSERT INTO accounts (email, password_hash, role) VALUES ($1, $2, 'ADMIN') RETURNING id", [config.email, hash]);
    await client.query("INSERT INTO admin_profiles (account_id, display_name) VALUES ($1, $2)", [account.rows[0].id, config.displayName]);
  }
}
