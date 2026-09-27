import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { RefundInput, type CurrentUser as CurrentUserT } from '@papperdash/contracts';
import type { Request } from 'express';
import { ZodPipe } from '../../platform/validation.js';
import { CurrentUser, Roles, RolesGuard, SessionGuard } from '../identity/index.js';
import { PaymentsService } from './payments.service.js';

@Controller('orders/:orderId')
@UseGuards(SessionGuard)
export class CheckoutController {
  constructor(private readonly payments: PaymentsService) {}

  /** Start or resume payment; the app shows Stripe's payment form with the returned client secret. */
  @Post('checkout')
  @HttpCode(200)
  checkout(@CurrentUser() user: CurrentUserT, @Param('orderId') orderId: string) {
    return this.payments.checkout(user, orderId);
  }

  @Get('payment')
  async payment(@CurrentUser() user: CurrentUserT, @Param('orderId') orderId: string) {
    return { payment: await this.payments.latestForOrder(user, orderId) };
  }
}

/** Stripe calls this; authenticity comes from the signature over the raw body, not from a session. */
@Controller('payments/webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody || !signature) throw new BadRequestException({ error: 'invalid_signature' });
    await this.payments.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}

@Controller('admin/orders/:orderId/refunds')
@UseGuards(SessionGuard, RolesGuard)
@Roles('support', 'admin')
export class RefundsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  refund(@CurrentUser() staff: CurrentUserT, @Param('orderId') orderId: string, @Body(new ZodPipe(RefundInput)) body: RefundInput) {
    return this.payments.refund(staff, orderId, body);
  }

  @Get()
  async list(@Param('orderId') orderId: string) {
    return { refunds: await this.payments.refundsForOrder(orderId) };
  }
}
