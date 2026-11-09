import Stripe from 'stripe';
import type { BillingEvent, CheckoutRequest, Invoice, PaidPlan, Payments } from './ports';

type SubStatus = Extract<BillingEvent, { kind: 'subscription_updated' }>['status'];

function mapStatus(s: string): SubStatus {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled') return 'canceled';
  if (s === 'incomplete_expired') return 'expired';
  return 'incomplete';
}

const toDate = (sec: number | null | undefined) => (sec ? new Date(sec * 1000) : null);

// Recent API versions moved the billing period from the subscription onto its items.
function period(sub: Record<string, unknown>): { start: Date | null; end: Date | null } {
  const item = (sub.items as { data?: Record<string, unknown>[] } | undefined)?.data?.[0] ?? {};
  const start = (sub.current_period_start ?? item.current_period_start) as number | undefined;
  const end = (sub.current_period_end ?? item.current_period_end) as number | undefined;
  return { start: toDate(start), end: toDate(end) };
}

export class StripePayments implements Payments {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly prices: Record<PaidPlan, string>,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async ensureCustomer(input: {
    email: string;
    userId: string;
    locale: 'de' | 'en';
  }): Promise<string> {
    const c = await this.stripe.customers.create({
      email: input.email,
      preferred_locales: [input.locale],
      metadata: { userId: input.userId },
    });
    return c.id;
  }

  async createCheckout(req: CheckoutRequest): Promise<{ id: string; url: string }> {
    const price = this.prices[req.plan];
    if (!price) throw new Error(`No Stripe price configured for plan ${req.plan}`);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: req.customerId,
      line_items: [{ price, quantity: 1 }],
      discounts: req.stripeCouponId ? [{ coupon: req.stripeCouponId }] : undefined,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      locale: req.locale,
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
      metadata: req.metadata,
      subscription_data: { metadata: req.metadata },
    });
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return { id: session.id, url: session.url };
  }

  async cancelAt(subscriptionId: string, at: Date | null): Promise<{ periodEnd: Date | null }> {
    const sub = await this.stripe.subscriptions.update(
      subscriptionId,
      at ? { cancel_at: Math.floor(at.getTime() / 1000) } : { cancel_at_period_end: true },
    );
    return { periodEnd: period(sub as unknown as Record<string, unknown>).end };
  }

  async listInvoices(customerId: string): Promise<Invoice[]> {
    const list = await this.stripe.invoices.list({ customer: customerId, limit: 24 });
    return list.data.map((i) => ({
      id: i.id ?? '',
      number: i.number ?? '',
      createdAt: new Date(i.created * 1000),
      totalCents: i.total,
      pdfUrl: i.invoice_pdf ?? null,
    }));
  }

  async parseWebhook(rawBody: Buffer, signature: string | undefined): Promise<BillingEvent> {
    if (!signature) throw new Error('missing Stripe-Signature');
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const obj = event.data.object as unknown as Record<string, unknown>;

    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
      const sub = await this.stripe.subscriptions.retrieve(String(obj.subscription));
      const p = period(sub as unknown as Record<string, unknown>);
      return {
        kind: 'checkout_completed',
        eventId: event.id,
        customerId: String(obj.customer),
        subscriptionId: sub.id,
        metadata: (obj.metadata as Record<string, string>) ?? {},
        periodStart: p.start ?? new Date(),
        periodEnd: p.end ?? new Date(),
      };
    }
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const p = period(obj);
      return {
        kind: 'subscription_updated',
        eventId: event.id,
        subscriptionId: String(obj.id),
        status:
          event.type === 'customer.subscription.deleted'
            ? 'canceled'
            : mapStatus(String(obj.status)),
        periodStart: p.start,
        periodEnd: p.end,
        cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
      };
    }
    if (event.type === 'invoice.payment_failed') {
      const parent = obj.parent as { subscription_details?: { subscription?: string } } | undefined;
      const subscriptionId =
        (obj.subscription as string | undefined) ?? parent?.subscription_details?.subscription;
      if (subscriptionId) return { kind: 'payment_failed', eventId: event.id, subscriptionId };
    }
    return { kind: 'ignored', eventId: event.id, type: event.type };
  }
}
