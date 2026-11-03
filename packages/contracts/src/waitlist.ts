import { z } from 'zod';
import { Email, LOCALES } from './identity.js';

/**
 * The waitlist, shown until the pilot station opens (ADR 0010). Stores only what is needed to send one email
 * when ordering opens: the address, the language, an optional postcode (to choose where stations go) and when
 * consent was given. Every confirmation email carries a link that removes the entry.
 */
export const JoinWaitlistInput = z.object({
  email: Email,
  locale: z.enum(LOCALES).default('sv'),
  /** Swedish postcode, "223 50" or "22350". Optional. */
  postcode: z
    .string()
    .trim()
    .regex(/^\d{3} ?\d{2}$/)
    .transform((s) => s.replace(' ', ''))
    .optional(),
  /** The visitor ticked "Email me when PapperDash opens". Required: no consent, no entry. */
  consent: z.literal(true),
});
export type JoinWaitlistInput = z.infer<typeof JoinWaitlistInput>;

export const LeaveWaitlistInput = z.object({ token: z.string().min(20).max(200) });

/** What the website needs to know about the service right now. */
export interface ServiceStatus {
  /** False until the pilot station runs: accounts and uploads work, placing orders does not. */
  ordering: boolean;
}
