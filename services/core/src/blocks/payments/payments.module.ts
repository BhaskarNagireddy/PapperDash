import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { IdentityModule } from '../identity/index.js';
import { OrdersModule } from '../orders/index.js';
import { DevCheckoutController } from './dev-checkout.controller.js';
import { DevPaymentProvider } from './dev.provider.js';
import { CheckoutController, RefundsController, WebhooksController } from './payments.controller.js';
import { PAYMENT_PROVIDER, PaymentsService } from './payments.service.js';
import { StripePaymentProvider } from './stripe.provider.js';

@Module({
  imports: [IdentityModule, OrdersModule],
  controllers: [CheckoutController, WebhooksController, RefundsController, DevCheckoutController],
  providers: [
    PaymentsService,
    // Stripe when its keys are set. Otherwise, outside production, the test provider (no money moves); in
    // production without keys, payments are off (checkout answers 503) and ordering cannot be opened.
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => (c.stripe ? new StripePaymentProvider(c.stripe) : c.devPayments ? new DevPaymentProvider() : null),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
