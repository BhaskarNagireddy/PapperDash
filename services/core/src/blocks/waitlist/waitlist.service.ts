import { GoneException, Inject, Injectable } from '@nestjs/common';
import type { EmailProvider, JoinWaitlistInput } from '@papperdash/contracts';
import { eq } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { DB, type Db } from '../../platform/database.js';
import { EMAIL_PROVIDER } from '../../platform/email.js';
import { newId, newSecret, sha256 } from '../../platform/ids.js';
import { RateLimiter } from '../../platform/rate-limit.js';
import { waitlistEmails } from './messages.js';
import { waitlistEntries } from './waitlist.schema.js';

@Injectable()
export class WaitlistService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly clock: Clock,
    private readonly limits: RateLimiter,
  ) {}

  /**
   * Adds the address and sends one confirmation email with a removal link. Joining again only updates the
   * language and postcode and sends nothing, so the form cannot be used to flood someone's inbox, and the
   * answer is the same either way, so it does not reveal who is on the list.
   */
  async join(input: JoinWaitlistInput, clientIp: string): Promise<void> {
    await this.limits.enforce(`waitlist:${clientIp}`, this.config.rateLimits.waitlistPerIp, 'Too many sign-ups from this network. Try again later.');
    const now = this.clock.now();
    const token = newSecret();
    const inserted = await this.db
      .insert(waitlistEntries)
      .values({ id: newId('wl'), email: input.email, locale: input.locale, postcode: input.postcode ?? null, consentAt: now, leaveTokenHash: sha256(token), createdAt: now })
      .onConflictDoUpdate({ target: waitlistEntries.email, set: { locale: input.locale, postcode: input.postcode ?? null, consentAt: now } })
      .returning({ leaveTokenHash: waitlistEntries.leaveTokenHash });
    // On conflict the stored hash is kept, so a new token means this was a new entry.
    if (inserted[0]?.leaveTokenHash !== sha256(token)) return;
    const msg = waitlistEmails.joined(input.locale, `${this.config.publicWebUrl}/${input.locale}/waitlist/leave?token=${token}`);
    await this.email.send({ to: input.email, ...msg });
  }

  /** Deletes the entry for a removal link. */
  async leave(token: string): Promise<void> {
    const deleted = await this.db.delete(waitlistEntries).where(eq(waitlistEntries.leaveTokenHash, sha256(token))).returning({ id: waitlistEntries.id });
    if (!deleted.length) throw new GoneException({ error: 'link_expired', message: 'This link was already used, so you are not on the waitlist.' });
  }
}
