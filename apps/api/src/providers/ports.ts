export const MAILER = Symbol('MAILER');
export const CAPTCHA = Symbol('CAPTCHA');
export const PAYMENTS = Symbol('PAYMENTS');

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Template name; used for provider tagging and the dev inbox, never contains personal data. */
  tag: string;
}

export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

export interface Captcha {
  verify(solution: string | undefined): Promise<boolean>;
}

export type PaidPlan = 'plus' | 'premium';

export interface CheckoutRequest {
  customerId: string;
  plan: PaidPlan;
  locale: 'de' | 'en';
  stripeCouponId?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface Invoice {
  id: string;
  number: string;
  createdAt: Date;
  totalCents: number;
  pdfUrl: string | null;
}

/** Provider-neutral billing events, produced from Stripe webhooks (or the local fake). */
export type BillingEvent =
  | {
      kind: 'checkout_completed';
      eventId: string;
      customerId: string;
      subscriptionId: string;
      metadata: Record<string, string>;
      periodStart: Date;
      periodEnd: Date;
    }
  | {
      kind: 'subscription_updated';
      eventId: string;
      subscriptionId: string;
      status: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'expired';
      periodStart: Date | null;
      periodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
    }
  | { kind: 'payment_failed'; eventId: string; subscriptionId: string }
  | { kind: 'ignored'; eventId: string; type: string };

export interface Payments {
  ensureCustomer(input: { email: string; userId: string; locale: 'de' | 'en' }): Promise<string>;
  createCheckout(req: CheckoutRequest): Promise<{ id: string; url: string }>;
  /** Ends the subscription at `at`, or at the end of the current period when `at` is null. */
  cancelAt(subscriptionId: string, at: Date | null): Promise<{ periodEnd: Date | null }>;
  listInvoices(customerId: string): Promise<Invoice[]>;
  parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent>;
}
