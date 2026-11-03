import { z } from 'zod';

/**
 * A PapperDash station: an unattended printer with an output tray and storage lockers (ADR 0010).
 * The public list holds only stations that are open, so the website never offers one that cannot print.
 */
export interface StationView {
  id: string;
  name: string;
  address: string;
  city: string;
  /** Whether the station has lockers for "collect later" and delivery orders. */
  lockers: boolean;
}

export const UpsertStationInput = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  lockers: z.boolean(),
  /** Only active stations are listed and accept orders. */
  active: z.boolean(),
});
export type UpsertStationInput = z.infer<typeof UpsertStationInput>;

/**
 * Station IDs are short, stable slugs such as "lund-central-1": lower-case letters and digits in parts joined by
 * single hyphens, at most 64 characters. Checked without a regular expression, so no input can make it slow.
 */
export function isStationId(id: string): boolean {
  if (id.length < 1 || id.length > 64) return false;
  return id.split('-').every((part) => part.length > 0 && [...part].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')));
}
