import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const file = process.argv[2] ?? ".env";
if (!/^\.env(?:\.[a-z0-9-]+)?$/.test(file) || file === ".env.example") throw new Error("Choose a local .env filename");
const values = {
  COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME ?? "activehub",
  POSTGRES_DB: "activehub",
  POSTGRES_USER: "activehub",
  POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  INITIAL_ADMIN_EMAIL: "admin@example.test",
  INITIAL_ADMIN_PASSWORD: `Aa1_${randomBytes(32).toString("base64url")}`,
  INITIAL_ADMIN_NAME: "Initial Administrator",
  SEED_DEMO: "false",
  DEMO_PASSWORD: `Demo1_${randomBytes(24).toString("base64url")}`,
  DEMO_NAMESPACE: "demo",
  API_PORT: process.env.API_PORT ?? "3000",
  FRONTEND_PORT: process.env.FRONTEND_PORT ?? "8080",
  MAILPIT_PORT: process.env.MAILPIT_PORT ?? "8025",
  NEXT_TELEMETRY_DISABLED: "1",
};
try {
  await writeFile(file, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log(`Created ${file} with generated local credentials`);
} catch (error) {
  if (error.code === "EEXIST") console.log(`${file} already exists; preserved its configuration`);
  else throw error;
}
