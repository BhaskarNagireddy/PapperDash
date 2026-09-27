import { z } from 'zod';
import type { DomainEvent } from './events.js';

export const ROLES = ['customer', 'courier', 'support', 'maintenance', 'admin', 'management'] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ['sv', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const PASSWORD_MIN_LENGTH = 10;

/** Emails are trimmed and lower-cased before validation, so " Anna@Example.se " and "anna@example.se" are one account. */
export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const RegisterInput = z.object({
  email: Email,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  locale: z.enum(LOCALES).default('sv'),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const VerifyEmailInput = z.object({ token: z.string().min(20).max(200) });
export const RequestPasswordResetInput = z.object({ email: Email });
export const ResetPasswordInput = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

/** The signed-in user as every block sees it. */
export interface CurrentUser {
  id: string;
  email: string;
  roles: Role[];
  locale: Locale;
  emailVerified: boolean;
  /** Set when the session was opened by scanning a station QR code. */
  stationId?: string;
}

// ---------- QR sign-in at a station ----------
// The station shows a short-lived QR code. The customer scans it with a phone where they are
// signed in (or sign in first with email + password). Approving it opens a station session for
// that customer, bound to that one station, so they can upload and print without typing on the kiosk.

export const QR_CHALLENGE_TTL_SECONDS = 120;
export const STATION_SESSION_TTL_SECONDS = 10 * 60;

export const QrChallengeStatus = ['pending', 'approved', 'consumed', 'expired'] as const;
export type QrChallengeStatus = (typeof QrChallengeStatus)[number];

export interface QrChallengeView {
  id: string;
  stationId: string;
  status: QrChallengeStatus;
  expiresAt: string;
  /** Present only on creation: the URL encoded in the QR code. Never logged. */
  qrUrl?: string;
}

export const ApproveQrChallengeInput = z.object({ token: z.string().min(20).max(200) });

export type UserRegistered = DomainEvent<'identity.UserRegistered', { userId: string; locale: Locale }>;
export type EmailVerified = DomainEvent<'identity.EmailVerified', { userId: string }>;
export type UserLoggedIn = DomainEvent<'identity.UserLoggedIn', { userId: string; method: 'password' | 'station-qr'; stationId?: string }>;
export type IdentityEvent = UserRegistered | EmailVerified | UserLoggedIn;
