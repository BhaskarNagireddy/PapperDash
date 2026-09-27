import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { RolesGuard, SessionGuard, StationGuard } from './auth.guards.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { LoginThrottle } from './login-throttle.js';
import { JoseOAuthVerifier, OAuthVerifier } from './oauth-verifier.js';

@Module({
  controllers: [IdentityController],
  providers: [
    IdentityService,
    LoginThrottle,
    SessionGuard,
    RolesGuard,
    StationGuard,
    { provide: OAuthVerifier, inject: [APP_CONFIG], useFactory: (c: AppConfig) => JoseOAuthVerifier.forProduction(c.oauthAudiences) },
  ],
  exports: [IdentityService, SessionGuard, RolesGuard, StationGuard],
})
export class IdentityModule {}
