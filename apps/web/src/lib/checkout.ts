import type { CheckoutView } from '@papperdash/contracts';
import { api } from './api';

/**
 * Starts (or resumes) paying for an order and leaves for the payment page: Stripe Checkout in production, the test
 * checkout in development and CI. Stripe brings the customer back to /<lang>/orders/<id>?checkout=success|cancelled.
 */
export async function goToCheckout(orderId: string, navigate: (url: string) => void = (url) => window.location.assign(url)): Promise<void> {
  const { checkoutUrl } = await api<CheckoutView>(`/orders/${orderId}/checkout`, { method: 'POST' });
  // Only Stripe's own pages or our own origin: never an address that came from anywhere else.
  const url = new URL(checkoutUrl, window.location.origin);
  if (url.origin !== window.location.origin && url.origin !== 'https://checkout.stripe.com') throw new Error(`Unexpected checkout address ${url.origin}`);
  navigate(url.toString());
}
