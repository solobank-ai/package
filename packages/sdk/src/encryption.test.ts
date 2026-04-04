import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  encryptKeypair,
  decryptKeypair,
  isEncryptedFile,
} from './encryption.js';

describe('encryptKeypair / decryptKeypair', () => {
  it('round-trips a secret key', () => {
    const secretKey = randomBytes(64);
    const encrypted = encryptKeypair(secretKey, 'mypassword');
    const decrypted = decryptKeypair(encrypted, 'mypassword');
    expect(Buffer.from(decrypted)).toEqual(Buffer.from(secretKey));
  });

  it('throws on wrong password', () => {
    const secretKey = randomBytes(64);
    const encrypted = encryptKeypair(secretKey, 'correct');
    expect(() => decryptKeypair(encrypted, 'wrong')).toThrow('wrong password');
  });

  it('produces different ciphertext each time (random salt/iv)', () => {
    const secretKey = randomBytes(64);
    const a = encryptKeypair(secretKey, 'pass');
    const b = encryptKeypair(secretKey, 'pass');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.salt).not.toBe(b.salt);
  });
});

describe('isEncryptedFile', () => {
  it('detects encrypted format', () => {
    expect(
      isEncryptedFile({ version: 1, encrypted: true, salt: '', iv: '', ciphertext: '', tag: '' }),
    ).toBe(true);
  });

  it('rejects plain array (old format)', () => {
    expect(isEncryptedFile([1, 2, 3])).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isEncryptedFile(null)).toBe(false);
    expect(isEncryptedFile(undefined)).toBe(false);
  });

  it('rejects object without encrypted flag', () => {
    expect(isEncryptedFile({ version: 1 })).toBe(false);
  });
});
