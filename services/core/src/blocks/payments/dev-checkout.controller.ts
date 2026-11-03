import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { PaymentProvider } from '@papperdash/contracts';
import type { Response } from 'express';
import { DevPaymentProvider } from './dev.provider.js';
import { PAYMENT_PROVIDER, PaymentsService } from './payments.service.js';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kr = (minor: number) => `${(minor / 100).toFixed(2).replace('.', ',')} kr`;

/**
 * The test checkout page that stands in for Stripe's when no Stripe keys are configured. It exists only with
 * DevPaymentProvider (never in production); with Stripe, every request here is 404.
 */
@Controller('payments/dev-checkout/:id')
export class DevCheckoutController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    private readonly payments: PaymentsService,
  ) {}

  private dev(): DevPaymentProvider {
    if (!(this.provider instanceof DevPaymentProvider)) throw new NotFoundException();
    return this.provider;
  }

  @Get()
  page(@Param('id') id: string, @Res() res: Response) {
    const session = this.dev().session(id);
    if (!session) throw new NotFoundException({ error: 'checkout_closed', message: 'This test checkout is closed. Start the payment again from your order.' });
    const action = `/v1/payments/dev-checkout/${encodeURIComponent(id)}`;
    res
      .status(200)
      .type('html')
      // Only this page: plain styling and forms that post back here.
      .setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      .setHeader('Cache-Control', 'no-store')
      .send(`<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Testbetalning</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f4ef;color:#141c24;margin:0;padding:32px 16px}main{max-width:28rem;margin:auto;background:#fff;border-radius:12px;padding:24px;display:grid;gap:16px}
.warn{background:#fff0c2;padding:8px 16px;border-radius:8px}button{min-height:48px;padding:0 16px;font:inherit;font-weight:700;border-radius:12px;cursor:pointer}
.pay{background:#141c24;color:#f6f4ef;border:0}.cancel{background:#fff;color:#141c24;border:1px solid #8a8378}form{display:inline}</style></head>
<body><main>
<h1>Testbetalning</h1>
<p class="warn"><strong>Inga pengar dras.</strong> Den här sidan ersätter Stripe när PapperDash körs utan Stripe-nycklar (utveckling och tester). Test payment: no money moves.</p>
<p>Beställning <strong>${escape(session.reference)}</strong></p>
<p>Att betala: <strong data-testid="dev-amount">${escape(kr(session.amount.amountMinor))}</strong></p>
<div><form method="post" action="${action}/pay"><button class="pay" type="submit">Betala (test)</button></form>
<form method="get" action="${escape(new URL(session.cancelUrl).pathname)}"><input type="hidden" name="checkout" value="cancelled"><button class="cancel" type="submit">Avbryt</button></form></div>
</main></body></html>`);
  }

  /** "Pay": the same signed webhook Stripe would send, through the same handler, then back to the order page. */
  @Post('pay')
  @HttpCode(303)
  async pay(@Param('id') id: string, @Res() res: Response) {
    const result = this.dev().pay(id);
    if (!result) throw new NotFoundException({ error: 'checkout_closed', message: 'This test checkout is closed.' });
    await this.payments.handleWebhook(result.rawBody, result.signature);
    res.redirect(303, result.redirectTo);
  }
}
