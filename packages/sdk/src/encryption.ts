import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';

export interface EncryptedKeypairFile {
  version: 1;
  encrypted: true;
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function encryptKeypair(
  secretKey: Uint8Array,
  password: string,
): EncryptedKeypairFile {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    encrypted: true,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptKeypair(
  file: EncryptedKeypairFile,
  password: string,
): Uint8Array {
  const salt = Buffer.from(file.salt, 'hex');
  const iv = Buffer.from(file.iv, 'hex');
  const ciphertext = Buffer.from(file.ciphertext, 'hex');
  const tag = Buffer.from(file.tag, 'hex');
  const key = deriveKey(password, salt);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return new Uint8Array(plaintext);
  } catch {
    throw new Error(
      'Failed to decrypt keypair — wrong password or corrupted file.',
    );
  }
}

export function isEncryptedFile(
  parsed: unknown,
): parsed is EncryptedKeypairFile {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as Record<string, unknown>).encrypted === true &&
    (parsed as Record<string, unknown>).version === 1
  );
}
