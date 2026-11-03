import crypto from 'node:crypto';
import CryptoJS from 'crypto-js';

const ALGO = 'aes-256-gcm';
const GCM_PREFIX = 'gcm:'; // version marker for new ciphertext

function getSecret(): string {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw === 'default-insecure-key-change-this') {
    throw new Error('ENCRYPTION_KEY is not configured securely');
  }
  return raw;
}

function getKey(): Buffer {
  return crypto.createHash('sha256').update(getSecret()).digest(); // 32 bytes
}

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return GCM_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptApiKey(encryptedKey: string): string {
  if (encryptedKey.startsWith(GCM_PREFIX)) {
    const raw = Buffer.from(encryptedKey.slice(GCM_PREFIX.length), 'base64');
    const decipher = crypto.createDecipheriv(ALGO, getKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
  // Legacy crypto-js value — decrypt so it can be re-saved under GCM.
  const out = CryptoJS.AES.decrypt(encryptedKey, getSecret()).toString(CryptoJS.enc.Utf8);
  if (!out) throw new Error('Failed to decrypt API key');
  return out;
}
