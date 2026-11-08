import { randomBytes, scrypt as derive, timingSafeEqual } from "node:crypto";

const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function scrypt(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    derive(password, salt, 64, parameters, (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(32).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt$131072$8$1$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts.slice(0, 4).join("$") !== "scrypt$131072$8$1" || !/^[a-f0-9]{64}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const expected = Buffer.from(parts[5], "hex");
  return timingSafeEqual(expected, await scrypt(password, parts[4]));
}
