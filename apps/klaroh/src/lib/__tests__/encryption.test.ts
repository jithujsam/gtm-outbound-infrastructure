import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import CryptoJS from 'crypto-js';
import { decryptApiKey, encryptApiKey } from '../encryption.ts';

const SECRET = 'unit-test-secret-which-is-long-enough';
const original = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = SECRET;
});
afterEach(() => {
  if (original === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = original;
});

test('round-trips a key and never stores plaintext', () => {
  const key = 'sk-instantly-1234567890abcdef';
  const enc = encryptApiKey(key);
  assert.ok(enc.startsWith('gcm:'));
  assert.ok(!enc.includes(key));
  assert.equal(decryptApiKey(enc), key);
});

test('uses a fresh IV: encrypting twice gives different ciphertexts', () => {
  assert.notEqual(encryptApiKey('same-value'), encryptApiKey('same-value'));
});

test('handles unicode and long values', () => {
  const key = 'ключ-🔑-' + 'x'.repeat(4000);
  assert.equal(decryptApiKey(encryptApiKey(key)), key);
});

test('tampered ciphertext is rejected (GCM auth tag)', () => {
  const enc = encryptApiKey('secret-value');
  const raw = Buffer.from(enc.slice(4), 'base64');
  raw[raw.length - 1] ^= 0xff;
  assert.throws(() => decryptApiKey('gcm:' + raw.toString('base64')));
});

test('ciphertext does not decrypt under a different secret', () => {
  const enc = encryptApiKey('secret-value');
  process.env.ENCRYPTION_KEY = 'a-completely-different-secret';
  assert.throws(() => decryptApiKey(enc));
});

test('legacy crypto-js ciphertext is still readable', () => {
  const legacy = CryptoJS.AES.encrypt('legacy-key', SECRET).toString();
  assert.equal(decryptApiKey(legacy), 'legacy-key');
});

test('refuses to run without a configured secret', () => {
  delete process.env.ENCRYPTION_KEY;
  assert.throws(() => encryptApiKey('x'), /ENCRYPTION_KEY/);
  process.env.ENCRYPTION_KEY = 'default-insecure-key-change-this';
  assert.throws(() => encryptApiKey('x'), /ENCRYPTION_KEY/);
});
