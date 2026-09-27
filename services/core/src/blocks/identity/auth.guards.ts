import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser as CurrentUserT, Role } from '@papperdash/contracts';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { safeEqual } from '../../platform/ids.js';
import { IdentityService } from './identity.service.js';

export const SESSION_COOKIE = 'pd_session';

type AuthedRequest = Request & { user?: CurrentUserT; stationId?: string };

export function sessionTokenFrom(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
}

/** Requires a signed-in user (web cookie, or Bearer token from the courier app or a station session). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly identity: IdentityService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = sessionTokenFrom(req);
    const user = token ? await this.identity.authenticate(token) : null;
    if (!user) throw new UnauthorizedException({ error: 'not_signed_in', message: 'Sign in to continue.' });
    req.user = user;
    return true;
  }
}

const ROLES_KEY = 'pd_roles';
/** Restricts a route to any of the given roles. Use after SessionGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user?.roles.some((r) => required.includes(r))) throw new ForbiddenException({ error: 'forbidden', message: 'You do not have access to this.' });
    return true;
  }
}

/**
 * Authenticates a station device by its ID and shared key.
 * Phase 1s (simulator) only; replaced by mutual TLS through the station gateway.
 */
@Injectable()
export class StationGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const id = req.header('x-station-id');
    const key = req.header('x-station-key');
    const expected = id ? this.config.stationKeys[id] : undefined;
    if (!id || !key || !expected || !safeEqual(key, expected)) throw new UnauthorizedException({ error: 'unknown_station' });
    req.stationId = id;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user);
export const CurrentStation = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().stationId);
