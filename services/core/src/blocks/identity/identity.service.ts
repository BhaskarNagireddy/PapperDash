import { ConflictException, ForbiddenException, GoneException, Inject, Injectable, NotFoundException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import {
  QR_CHALLENGE_TTL_SECONDS,
  STATION_SESSION_TTL_SECONDS,
  type CurrentUser,
  type EmailProvider,
  type IdentityEvent,
  type Locale,
  type LoginInput,
  type QrChallengeView,
  type RegisterInput,
  type Role,
} from '@papperdash/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Clock } from '../../platform/clock.js';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { DB, type Db, type DbOrTx } from '../../platform/database.js';
import { EMAIL_PROVIDER } from '../../platform/email.js';
import { Outbox } from '../../platform/events.js';
import { newId, newSecret, sha256 } from '../../platform/ids.js';
import { oneTimeTokens, qrChallenges, sessions, users } from './identity.schema.js';
import { LoginThrottle } from './login-throttle.js';
import { authEmails } from './messages.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.js';

const WEB_SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const VERIFY_TTL_MS = 24 * 3600 * 1000;
const RESET_TTL_MS = 3600 * 1000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

type UserRow = typeof users.$inferSelect;

@Injectable()
export class IdentityService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly clock: Clock,
    private readonly outbox: Outbox,
    private readonly throttle: LoginThrottle,
  ) {}

  // ---------- Registration and email verification ----------

  async register(input: RegisterInput): Promise<CurrentUser> {
    const passwordHash = await hashPassword(input.password);
    const now = this.clock.now();
    const id = newId('usr');
    const verifyToken = newSecret();

    const user = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({ id, email: input.email, passwordHash, locale: input.locale, createdAt: now })
        .onConflictDoNothing({ target: users.email })
        .returning();
      if (!row) throw new ConflictException({ error: 'email_taken', message: 'An account with this email already exists. Log in or reset your password.' });
      await tx.insert(oneTimeTokens).values({
        id: newId('ott'),
        tokenHash: sha256(verifyToken),
        userId: id,
        purpose: 'verify-email',
        expiresAt: new Date(now.getTime() + VERIFY_TTL_MS),
      });
      await this.outbox.append<IdentityEvent>(tx, { type: 'identity.UserRegistered', version: 1, aggregateId: id, payload: { userId: id, locale: input.locale } });
      return row;
    });

    const msg = authEmails.verify(input.locale, `${this.config.publicWebUrl}/verify-email?token=${verifyToken}`);
    await this.email.send({ to: input.email, ...msg });
    return toCurrentUser(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.useOneTimeToken(token, 'verify-email');
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: this.clock.now() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
      await this.outbox.append<IdentityEvent>(tx, { type: 'identity.EmailVerified', version: 1, aggregateId: userId, payload: { userId } });
    });
  }

  // ---------- Email + password (the main login) ----------

  async login(input: LoginInput, clientIp: string): Promise<{ user: CurrentUser; session: IssuedSession }> {
    const throttleKey = `${input.email}|${clientIp}`;
    if (this.throttle.isLocked(throttleKey)) {
      throw new HttpException({ error: 'too_many_attempts', message: 'Too many failed attempts. Wait 15 minutes or reset your password.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));
    const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
    if (!user || !ok) {
      this.throttle.recordFailure(throttleKey);
      throw new UnauthorizedException({ error: 'invalid_credentials', message: 'Wrong email or password. Try again or reset your password.' });
    }
    this.throttle.reset(throttleKey);
    const session = await this.db.transaction(async (tx) => {
      const s = await this.issueSession(tx, user.id, 'web', null, WEB_SESSION_TTL_MS);
      await this.outbox.append<IdentityEvent>(tx, { type: 'identity.UserLoggedIn', version: 1, aggregateId: user.id, payload: { userId: user.id, method: 'password' } });
      return s;
    });
    return { user: toCurrentUser(user), session };
  }

  async logout(token: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: this.clock.now() }).where(eq(sessions.tokenHash, sha256(token)));
  }

  /** Resolves a session token to the signed-in user, or null when missing, expired or revoked. */
  async authenticate(token: string): Promise<CurrentUser | null> {
    const now = this.clock.now();
    const [row] = await this.db
      .select({ user: users, stationId: sessions.stationId })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
    if (!row) return null;
    return { ...toCurrentUser(row.user), ...(row.stationId ? { stationId: row.stationId } : {}) };
  }

  // ---------- Password reset ----------

  /** Always succeeds, so the response does not reveal whether the email has an account. */
  async requestPasswordReset(email: string): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) return;
    const token = newSecret();
    await this.db.insert(oneTimeTokens).values({
      id: newId('ott'),
      tokenHash: sha256(token),
      userId: user.id,
      purpose: 'reset-password',
      expiresAt: new Date(this.clock.now().getTime() + RESET_TTL_MS),
    });
    const msg = authEmails.reset(user.locale as Locale, `${this.config.publicWebUrl}/reset-password?token=${token}`);
    await this.email.send({ to: user.email, ...msg });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.useOneTimeToken(token, 'reset-password');
    const passwordHash = await hashPassword(password);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
      // A reset signs the account out everywhere.
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    });
  }

  // ---------- QR sign-in at a station (the second login method) ----------

  /** Called by a station to show a fresh QR code. */
  async createQrChallenge(stationId: string): Promise<QrChallengeView> {
    const token = newSecret();
    const now = this.clock.now();
    const row = {
      id: newId('qr'),
      tokenHash: sha256(token),
      stationId,
      status: 'pending',
      createdAt: now,
      expiresAt: new Date(now.getTime() + QR_CHALLENGE_TTL_SECONDS * 1000),
    };
    await this.db.insert(qrChallenges).values(row);
    return { id: row.id, stationId, status: 'pending', expiresAt: row.expiresAt.toISOString(), qrUrl: `${this.config.publicWebUrl}/qr/${token}` };
  }

  /** Called from the customer's phone, where they are signed in with email + password. */
  async approveQrChallenge(user: CurrentUser, token: string): Promise<{ stationId: string }> {
    if (user.stationId) throw new ForbiddenException({ error: 'station_session', message: 'Approve the QR code from your own phone, not from a station.' });
    const now = this.clock.now();
    const [row] = await this.db
      .update(qrChallenges)
      .set({ status: 'approved', userId: user.id, approvedAt: now })
      .where(and(eq(qrChallenges.tokenHash, sha256(token)), eq(qrChallenges.status, 'pending'), gt(qrChallenges.expiresAt, now)))
      .returning();
    if (!row) throw new GoneException({ error: 'qr_expired', message: 'This QR code has expired or was already used. Tap “Start” on the station for a new one.' });
    return { stationId: row.stationId };
  }

  /**
   * Polled by the station that created the challenge. Once approved, it is consumed exactly once
   * and the station receives a short session for that customer, valid only at that station.
   */
  async claimQrChallenge(
    stationId: string,
    challengeId: string,
  ): Promise<{ status: QrChallengeView['status']; session?: IssuedSession; user?: Pick<CurrentUser, 'id' | 'locale'> }> {
    const now = this.clock.now();
    const [row] = await this.db.select().from(qrChallenges).where(and(eq(qrChallenges.id, challengeId), eq(qrChallenges.stationId, stationId)));
    if (!row) throw new NotFoundException();
    if (row.status === 'pending' && row.expiresAt <= now) {
      await this.db.update(qrChallenges).set({ status: 'expired' }).where(and(eq(qrChallenges.id, row.id), eq(qrChallenges.status, 'pending')));
      return { status: 'expired' };
    }
    if (row.status !== 'approved' || !row.userId) return { status: row.status as QrChallengeView['status'] };

    const userId = row.userId;
    return this.db.transaction(async (tx) => {
      const [consumed] = await tx
        .update(qrChallenges)
        .set({ status: 'consumed', consumedAt: now })
        .where(and(eq(qrChallenges.id, row.id), eq(qrChallenges.status, 'approved')))
        .returning();
      if (!consumed) return { status: 'consumed' as const };
      const session = await this.issueSession(tx, userId, 'station', stationId, STATION_SESSION_TTL_SECONDS * 1000);
      await this.outbox.append<IdentityEvent>(tx, {
        type: 'identity.UserLoggedIn',
        version: 1,
        aggregateId: userId,
        payload: { userId, method: 'station-qr', stationId },
      });
      const [u] = await tx.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.id, userId));
      return { status: 'consumed' as const, session, user: { id: u!.id, locale: u!.locale as Locale } };
    });
  }

  // ---------- Staff administration ----------

  async setRoles(userId: string, roles: Role[]): Promise<void> {
    const res = await this.db.update(users).set({ roles }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!res.length) throw new NotFoundException();
  }

  // ---------- internals ----------

  private async issueSession(tx: DbOrTx, userId: string, kind: 'web' | 'station', stationId: string | null, ttlMs: number): Promise<IssuedSession> {
    const token = newSecret();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await tx.insert(sessions).values({ id: newId('ses'), tokenHash: sha256(token), userId, kind, stationId, createdAt: now, expiresAt });
    return { token, expiresAt };
  }

  private async useOneTimeToken(token: string, purpose: string): Promise<string> {
    const now = this.clock.now();
    const [row] = await this.db
      .update(oneTimeTokens)
      .set({ usedAt: now })
      .where(and(eq(oneTimeTokens.tokenHash, sha256(token)), eq(oneTimeTokens.purpose, purpose), isNull(oneTimeTokens.usedAt), gt(oneTimeTokens.expiresAt, now)))
      .returning();
    if (!row) throw new GoneException({ error: 'link_expired', message: 'This link has expired or was already used. Request a new one.' });
    return row.userId;
  }
}

function toCurrentUser(u: UserRow): CurrentUser {
  return { id: u.id, email: u.email, roles: u.roles as Role[], locale: u.locale as Locale, emailVerified: !!u.emailVerifiedAt };
}
