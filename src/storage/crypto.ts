import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.NEXUS_MASTER_KEY || process.env.ENCRYPTION_KEY;
  if (envKey) {
    // Derive exactly 32 bytes using SHA-256 if arbitrary string is passed
    cachedKey = crypto.createHash("sha256").update(envKey).digest();
    return cachedKey;
  }

  // Fallback: Persistent master key file in data directory
  const keyDir = path.resolve(process.cwd(), "data");
  const keyPath = path.join(keyDir, ".master.key");

  try {
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true });
    }

    if (fs.existsSync(keyPath)) {
      const fileContent = fs.readFileSync(keyPath, "utf8").trim();
      cachedKey = Buffer.from(fileContent, "hex");
      if (cachedKey.length === KEY_LENGTH) return cachedKey;
    }

    const generated = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, generated.toString("hex"), { mode: 0o600 });
    cachedKey = generated;
    return cachedKey;
  } catch {
    // Ephemeral in-memory fallback if disk is completely read-only
    cachedKey = crypto.randomBytes(KEY_LENGTH);
    return cachedKey;
  }
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plainText: string): EncryptedData {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag
  };
}

export function decryptSecret(encrypted: EncryptedData): string {
  const key = getMasterKey();
  const iv = Buffer.from(encrypted.iv, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(encrypted.tag, "hex"));

  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function redactSecret(secret: string): string {
  if (!secret || secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}
