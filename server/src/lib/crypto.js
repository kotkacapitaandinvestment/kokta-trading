import crypto from 'crypto';

// Read on first use, not at import, so modules that only sometimes encrypt
// (and tests that never do) load without the key.
let cached;
function keyBytes() {
  if (!cached) {
    if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY is not set.');
    cached = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  }
  return cached;
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptSecret(stored) {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

export function maskSecret(plaintext) {
  if (!plaintext) return '';
  const tail = plaintext.slice(-4);
  return `••••••••${tail}`;
}
