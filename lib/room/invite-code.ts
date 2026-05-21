const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, excludes 0/1/I/L/O for clarity
const CODE_LEN = 6;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export const INVITE_CODE_RE = /^[A-HJKM-NP-Z2-9]{6}$/;

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code);
}
