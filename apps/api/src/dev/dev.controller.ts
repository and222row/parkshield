import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { BillingService } from '../billing/billing.service';
import { VALKEY } from '../core/tokens';
import { ZodPipe } from '../core/zod.pipe';
import type { FakePayments } from '../providers/fake-payments';
import { DEV_MAILBOX_KEY } from '../providers/mailer';
import { simplePdf } from '../providers/pdf';
import { PAYMENTS } from '../providers/ports';

const Complete = z.object({ sessionId: z.string().startsWith('cs_fake_').max(64) });

/**
 * Local-only helpers for the fake providers: dev inbox, simulated Stripe checkout, fake invoices.
 * Registered only when at least one provider is faked and NODE_ENV is not production (see apps.ts).
 */
@Controller('v1/dev')
export class DevController {
  constructor(
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(PAYMENTS) private readonly payments: FakePayments,
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  @Get('mailbox')
  async mailbox() {
    const rows = await this.valkey.lrange(DEV_MAILBOX_KEY, 0, 49);
    return { mails: rows.map((r) => JSON.parse(r) as unknown) };
  }

  @Get('payments/sessions/:id')
  async session(@Param('id') id: string) {
    const s = await this.payments.getSession(id);
    if (!s) throw new NotFoundException();
    const amountCents = await this.billing.priceFor(s.plan, s.metadata.promoCodeId);
    return {
      id: s.id,
      plan: s.plan,
      amountCents,
      cancelUrl: s.cancelUrl,
      successUrl: s.successUrl,
    };
  }

  @Post('payments/complete')
  @HttpCode(200)
  async complete(@Body(new ZodPipe(Complete)) body: z.infer<typeof Complete>) {
    const s = await this.payments.getSession(body.sessionId);
    if (!s) throw new NotFoundException();
    const amount = await this.billing.priceFor(s.plan, s.metadata.promoCodeId);
    const event = await this.payments.complete(body.sessionId, amount);
    if (!event) throw new NotFoundException();
    await this.billing.handle(event);
    return { redirectUrl: s.successUrl };
  }

  @Get('payments/invoices/:file')
  async invoice(@Param('file') file: string, @Res() reply: FastifyReply) {
    const invoice = await this.payments.findInvoice(file.replace(/\.pdf$/, ''));
    if (!invoice) throw new NotFoundException();
    const euros = (invoice.totalCents / 100).toFixed(2).replace('.', ',');
    const pdf = simplePdf([
      'ParkShield - Rechnung (lokale Testrechnung)',
      `Rechnungsnummer: ${invoice.number}`,
      `Datum: ${invoice.createdAt.toISOString().slice(0, 10)}`,
      `Betrag: ${euros} EUR inkl. 19 % MwSt.`,
      'Diese Rechnung wurde vom lokalen Test-Zahlungsanbieter erzeugt.',
    ]);
    return reply.header('content-type', 'application/pdf').send(pdf);
  }
}
