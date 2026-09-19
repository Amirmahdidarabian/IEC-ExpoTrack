import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 16384;

function derive(password: string, salt: string, length: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password, salt, KEY_LENGTH, { N: COST, r: 8, p: 1 });
  return `scrypt$${COST}$8$1$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, r, p, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "hex");
    const actual = await derive(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
