import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, excludes 0/1/I/L/O
const CODE_LEN = 6;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return out;
}

// Regex derived from ALPHABET to avoid drift if alphabet ever changes.
export const INVITE_CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code);
}
