import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isStationId, type FulfilmentMethod, type StationView, type UpsertStationInput } from '@papperdash/contracts';
import { asc, eq } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { DB, type Db } from '../../platform/database.js';
import { stations } from './stations.schema.js';

type Row = typeof stations.$inferSelect;

@Injectable()
export class StationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Open stations, for the website's pick-up choice. */
  async listActive(): Promise<StationView[]> {
    const rows = await this.db.select().from(stations).where(eq(stations.active, true)).orderBy(asc(stations.city), asc(stations.name));
    return rows.map(toView);
  }

  /** Admin: add or change a station. */
  async upsert(id: string, input: UpsertStationInput): Promise<StationView & { active: boolean }> {
    if (!isStationId(id)) throw new BadRequestException({ error: 'invalid_station_id', message: 'Use a short ID like "lund-central-1".' });
    const now = this.clock.now();
    const [row] = await this.db
      .insert(stations)
      .values({ id, ...input, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: stations.id, set: { ...input, updatedAt: now } })
      .returning();
    return { ...toView(row!), active: row!.active };
  }

  /**
   * Checks that an order may use this station: it exists, is open, and has lockers when the order goes into one.
   * Returns a customer-facing problem, or null.
   */
  async problemFor(stationId: string, fulfilment: FulfilmentMethod): Promise<{ error: string; message: string } | null> {
    const [row] = await this.db.select().from(stations).where(eq(stations.id, stationId));
    if (!row?.active) return { error: 'station_unavailable', message: 'That station is not open. Choose another one.' };
    if (fulfilment === 'locker' && !row.lockers) return { error: 'no_lockers', message: 'That station has no lockers. Print there and collect it right away, or choose another station.' };
    return null;
  }
}

function toView(r: Row): StationView {
  return { id: r.id, name: r.name, address: r.address, city: r.city, lockers: r.lockers };
}
