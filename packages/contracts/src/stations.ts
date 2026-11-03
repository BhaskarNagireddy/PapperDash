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

/** Station IDs are short, stable slugs such as "lund-central-1". */
export const STATION_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
