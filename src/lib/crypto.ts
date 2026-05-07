export function encryptCredential(plain: string): string {
  return Buffer.from(plain, 'utf8').toString('base64');
}

export function decryptCredential(encrypted: string): string {
  try {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  } catch {
    return encrypted;
  }
}
