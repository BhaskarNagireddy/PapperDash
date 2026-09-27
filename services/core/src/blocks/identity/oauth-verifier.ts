import type { OAuthProvider } from '@papperdash/contracts';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface VerifiedIdentity {
  provider: OAuthProvider;
  /** The provider's stable user ID ("sub"). */
  subject: string;
  email?: string;
  emailVerified: boolean;
}

export interface ProviderSettings {
  /** Accepted token audiences: our OAuth client IDs (web, iOS, Android) or Apple bundle/service IDs. Empty = provider disabled. */
  audiences: string[];
  issuers: string[];
  keys: JWTVerifyGetKey;
}

export class OAuthTokenError extends Error {}

/** Port: turns a provider ID token into a verified identity. Swappable in tests. */
export abstract class OAuthVerifier {
  abstract isEnabled(provider: OAuthProvider): boolean;
  abstract verify(provider: OAuthProvider, idToken: string): Promise<VerifiedIdentity>;
}

/** Verifies Google and Apple ID tokens against the providers' published signing keys. */
export class JoseOAuthVerifier extends OAuthVerifier {
  constructor(private readonly providers: Partial<Record<OAuthProvider, ProviderSettings>>) {
    super();
  }

  static forProduction(audiences: Record<OAuthProvider, string[]>): JoseOAuthVerifier {
    return new JoseOAuthVerifier({
      google: {
        audiences: audiences.google,
        issuers: ['https://accounts.google.com', 'accounts.google.com'],
        keys: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
      },
      apple: {
        audiences: audiences.apple,
        issuers: ['https://appleid.apple.com'],
        keys: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
      },
    });
  }

  isEnabled(provider: OAuthProvider): boolean {
    return !!this.providers[provider]?.audiences.length;
  }

  async verify(provider: OAuthProvider, idToken: string): Promise<VerifiedIdentity> {
    const settings = this.providers[provider];
    if (!settings?.audiences.length) throw new OAuthTokenError(`${provider} sign-in is not enabled`);
    try {
      const { payload } = await jwtVerify(idToken, settings.keys, {
        issuer: settings.issuers,
        audience: settings.audiences,
        algorithms: ['RS256'],
        clockTolerance: 30,
      });
      if (!payload.sub) throw new OAuthTokenError('Token has no subject');
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;
      // Apple sends email_verified as the string "true".
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      return { provider, subject: payload.sub, email, emailVerified };
    } catch (err) {
      if (err instanceof OAuthTokenError) throw err;
      throw new OAuthTokenError((err as Error).message);
    }
  }
}
