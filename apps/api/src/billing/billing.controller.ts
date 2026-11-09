import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';
import { CurrentUser, SessionGuard } from '../auth/guards';
import type { AuthContext } from '../auth/session.service';
import { truncateIp } from '../core/ip';
import { LOGGER } from '../core/tokens';
import { ZodPipe } from '../core/zod.pipe';
import { PAYMENTS, type Payments } from '../providers/ports';
import { BillingService } from './billing.service';

const Checkout = z.object({
  plan: z.enum(['plus', 'premium']),
  promoCode: z.string().trim().min(1).max(40).optional(),
  // §356(4)/§357a BGB: the customer must expressly request the immediate start (US-06).
  immediateStart: z.literal(true),
});
const CancelKind = z.object({
  kind: z.enum(['ordinary', 'extraordinary']).default('ordinary'),
  reason: z.string().trim().max(1000).optional(),
});
const CancelWithoutLogin = CancelKind.extend({
  email: z.email().max(254),
  contractNo: z.string().trim().min(4).max(12),
  captcha: z.string().max(4096).optional(),
  locale: z.enum(['de', 'en']).default('de'),
});

@Controller('v1')
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  @Get('billing/subscription')
  @UseGuards(SessionGuard)
  async subscription(@CurrentUser() user: AuthContext) {
    return { subscription: await this.billing.summary(user.userId) };
  }

  @Post('billing/checkout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  checkout(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(Checkout)) body: z.infer<typeof Checkout>,
  ) {
    return this.billing.checkout(user, body);
  }

  @Post('billing/portal')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  portal(@CurrentUser() user: AuthContext) {
    return this.billing.portal(user.userId);
  }

  @Get('billing/invoices')
  @UseGuards(SessionGuard)
  async invoices(@CurrentUser() user: AuthContext) {
    return { invoices: await this.billing.invoices(user.userId) };
  }

  @Post('billing/cancel')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async cancel(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(CancelKind)) body: z.infer<typeof CancelKind>,
  ) {
    const r = await this.billing.cancel(user.userId, body);
    return { receivedAt: r.receivedAt, endsAt: r.endsAt, contractNo: r.contractNo };
  }

  /** Same response whether or not a contract matched; the result goes to the e-mail address. */
  @Post('billing/cancel-request')
  @HttpCode(200)
  async cancelWithoutLogin(
    @Body(new ZodPipe(CancelWithoutLogin)) body: z.infer<typeof CancelWithoutLogin>,
    @Req() req: FastifyRequest,
  ) {
    const r = await this.billing.cancelWithoutLogin({ ...body, ipPrefix: truncateIp(req.ip) });
    return { receivedAt: r.receivedAt };
  }
}

@Controller('v1/webhooks')
export class StripeWebhookController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(PAYMENTS) private readonly payments: Payments,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  async stripe(
    @Req() req: FastifyRequest & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    let event;
    try {
      event = await this.payments.parseWebhook(req.rawBody ?? Buffer.alloc(0), signature);
    } catch {
      throw new BadRequestException({ error: 'invalid_signature' });
    }
    try {
      await this.billing.handle(event);
    } catch (err) {
      this.logger.error({ eventId: event.eventId, err: String(err) }, 'billing event failed');
      throw new InternalServerErrorException(); // non-2xx makes Stripe retry
    }
    return { received: true };
  }
}
