// Pure-function checks; no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeAt, verifyCode, base32Encode, base32Decode, newRecoveryCodes, hashRecovery } from '../../src/lib/totp.js';
import { cleanImage } from '../../src/lib/imageSafety.js';
import { passwordProblem, needsRehash } from '../../src/lib/passwords.js';
import { isAllowedOrigin } from '../../src/lib/origins.js';

test('TOTP matches the RFC 6238 test vector', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(codeAt(secret, 1), '287082'); // T = 59 s
  assert.equal(codeAt(secret, 37037036), '081804'); // T = 1111111109 s
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
});

test('TOTP accepts one step of drift and refuses replays', () => {
  const secret = base32Encode(Buffer.from('abcdefghijabcdefghij'));
  const now = 1_800_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyCode(secret, codeAt(secret, step), { now }), step);
  assert.equal(verifyCode(secret, codeAt(secret, step - 1), { now }), step - 1);
  assert.equal(verifyCode(secret, codeAt(secret, step - 3), { now }), null);
  assert.equal(verifyCode(secret, codeAt(secret, step), { now, lastUsedStep: step }), null);
  assert.equal(verifyCode(secret, 'abcdef', { now }), null);
});

test('recovery codes are unique and hashed case-insensitively', () => {
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecovery(codes[0].toUpperCase()), hashRecovery(` ${codes[0]} `));
});

test('image cleaning rejects fakes and oversize canvases', () => {
  assert.ok(cleanImage(Buffer.from('<svg/>'), 'image/svg+xml').error);
  assert.ok(cleanImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3]), 'image/jpeg').error);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'latin1');
  ihdr.writeUInt32BE(20000, 8);
  ihdr.writeUInt32BE(20000, 12);
  assert.ok(cleanImage(Buffer.concat([sig, ihdr]), 'image/png').error);
});

test('password rules', () => {
  assert.ok(passwordProblem('short'));
  assert.ok(passwordProblem('password123'));
  assert.ok(passwordProblem('aaaaaaaaaaaa'));
  assert.ok(passwordProblem('amarachi2024', { email: 'amarachi@example.com' }));
  assert.equal(passwordProblem('orange-kettle-river-9'), null);
  assert.equal(needsRehash('$2a$10$abcdefghijklmnopqrstuv'), true);
  assert.equal(needsRehash('$2a$12$abcdefghijklmnopqrstuv'), false);
});

test('only Kotka origins are trusted', () => {
  assert.equal(isAllowedOrigin('https://www.kotkafinance.online'), true);
  assert.equal(isAllowedOrigin('https://kotkafinance.online.evil.example'), false);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('null'), false);
  assert.equal(isAllowedOrigin('https://kokta-trading-abc123-kotka.vercel.app'), true);
  assert.equal(isAllowedOrigin('https://kokta-trading-abc123-attacker.vercel.app'), false);
});
