import type { Redis } from 'ioredis';
import { randomToken } from '../core/crypto';
import type { BillingEvent, CheckoutRequest, Invoice, Payments } from './ports';

const key = (...parts: string[]) => `dev:payments:${parts.join(':')}`;
const DAY = 86_400_000;

interface FakeSession extends CheckoutRequest {
  id: string;
}

/**
 * Local stand-in for Stripe while STRIPE_SECRET_KEY is empty. State lives in Valkey so it survives API
 * restarts. The dev checkout page completes a session, which produces the same BillingEvent a real
 * webhook would, so BillingService code paths are identical.
 */
export class FakePayments implements Payments {
  constructor(
    private readonly valkey: Redis,
    private readonly webBaseUrl: string,
  ) {}

  async ensureCustomer(): Promise<string> {
    return `cus_fake_${randomToken(9)}`;
  }

  async createCheckout(req: CheckoutRequest): Promise<{ id: string; url: string }> {
    const id = `cs_fake_${randomToken(12)}`;
    await this.valkey.set(key('session', id), JSON.stringify({ ...req, id }), 'EX', 3600);
    return { id, url: `${this.webBaseUrl}/dev/checkout?session=${encodeURIComponent(id)}` };
  }

  async getSession(id: string): Promise<FakeSession | null> {
    const raw = await this.valkey.get(key('session', id));
    return raw ? (JSON.parse(raw) as FakeSession) : null;
  }

  /** Simulates a successful payment: subscription for one year plus a PDF invoice. */
  async complete(sessionId: string, amountCents: number): Promise<BillingEvent | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    await this.valkey.del(key('session', sessionId));
    const now = new Date();
    const subscriptionId = `sub_fake_${randomToken(9)}`;
    const invoice: Invoice = {
      id: `in_fake_${randomToken(9)}`,
      number: `DEV-${now.getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`,
      createdAt: now,
      totalCents: amountCents,
      pdfUrl: null,
    };
    await this.valkey.lpush(key('invoices', session.customerId), JSON.stringify(invoice));
    return {
      kind: 'checkout_completed',
      eventId: `evt_fake_${randomToken(9)}`,
      customerId: session.customerId,
      subscriptionId,
      metadata: session.metadata,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 365 * DAY),
    };
  }

  async cancelAt(): Promise<{ periodEnd: Date | null }> {
    return { periodEnd: null };
  }

  async listInvoices(customerId: string): Promise<Invoice[]> {
    const rows = await this.valkey.lrange(key('invoices', customerId), 0, 23);
    return rows.map((r) => {
      const i = JSON.parse(r) as Invoice;
      return {
        ...i,
        createdAt: new Date(i.createdAt),
        pdfUrl: `/v1/dev/payments/invoices/${i.id}.pdf`,
      };
    });
  }

  async findInvoice(invoiceId: string): Promise<Invoice | null> {
    for await (const keys of this.valkey.scanStream({ match: key('invoices', '*') })) {
      for (const k of keys as string[]) {
        for (const r of await this.valkey.lrange(k, 0, -1)) {
          const i = JSON.parse(r) as Invoice;
          if (i.id === invoiceId) return { ...i, createdAt: new Date(i.createdAt) };
        }
      }
    }
    return null;
  }

  async parseWebhook(): Promise<BillingEvent> {
    throw new Error('Stripe webhooks are not used in fake mode');
  }
}
