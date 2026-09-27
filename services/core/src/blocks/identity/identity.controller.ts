import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApproveQrChallengeInput,
  LoginInput,
  RegisterInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  VerifyEmailInput,
  type CurrentUser as CurrentUserT,
} from '@papperdash/contracts';
import { Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { ZodPipe } from '../../platform/validation.js';
import { CurrentStation, CurrentUser, SESSION_COOKIE, SessionGuard, StationGuard, sessionTokenFrom } from './auth.guards.js';
import { IdentityService } from './identity.service.js';

@Controller('auth')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('register')
  async register(@Body(new ZodPipe(RegisterInput)) body: RegisterInput) {
    const user = await this.identity.register(body);
    return { user, next: 'verify-email' };
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body(new ZodPipe(VerifyEmailInput)) body: z.infer<typeof VerifyEmailInput>) {
    await this.identity.verifyEmail(body.token);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginInput)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, session } = await this.identity.login(body, req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      expires: session.expiresAt,
      path: '/',
    });
    // The token is also returned for the courier app, which sends it as a Bearer token.
    return { user, token: session.token, expiresAt: session.expiresAt.toISOString() };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = sessionTokenFrom(req);
    if (token) await this.identity.logout(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: CurrentUserT) {
    return { user };
  }

  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(@Body(new ZodPipe(RequestPasswordResetInput)) body: z.infer<typeof RequestPasswordResetInput>) {
    await this.identity.requestPasswordReset(body.email);
    return { message: 'If an account exists for this email, we have sent a reset link.' };
  }

  @Post('password-reset/confirm')
  @HttpCode(204)
  async confirmReset(@Body(new ZodPipe(ResetPasswordInput)) body: z.infer<typeof ResetPasswordInput>) {
    await this.identity.resetPassword(body.token, body.password);
  }

  // ----- QR sign-in -----

  /** Station: create a QR code to show on screen. */
  @Post('qr/challenges')
  @UseGuards(StationGuard)
  createQr(@CurrentStation() stationId: string) {
    return this.identity.createQrChallenge(stationId);
  }

  /** Station: poll until the customer approves; returns a station session once. */
  @Get('qr/challenges/:id')
  @UseGuards(StationGuard)
  async claimQr(@CurrentStation() stationId: string, @Param('id') id: string) {
    const r = await this.identity.claimQrChallenge(stationId, id);
    return r.session ? { status: r.status, user: r.user, token: r.session.token, expiresAt: r.session.expiresAt.toISOString() } : { status: r.status };
  }

  /** Customer's phone: approve the QR code they scanned. */
  @Post('qr/approve')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  approveQr(@CurrentUser() user: CurrentUserT, @Body(new ZodPipe(ApproveQrChallengeInput)) body: z.infer<typeof ApproveQrChallengeInput>) {
    return this.identity.approveQrChallenge(user, body.token);
  }
}
