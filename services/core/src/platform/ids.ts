import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ulid } from 'ulid';

/** Prefixed, sortable IDs: usr_01J…, ord_01J…, evt_01J… */
export const newId = (prefix: string) => `${prefix}_${ulid()}`;

/** A URL-safe secret for sessions, links and QR codes. Only its hash is stored. */
export const newSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Short, unambiguous code for people to read aloud: no I, L, O, U. */
export function humanCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CROCKFORD[b % 32]).join('');
}
