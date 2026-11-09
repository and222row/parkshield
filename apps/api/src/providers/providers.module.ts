import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { fakeProviders, type Env } from '../config/env';
import { LOGGER, VALKEY } from '../core/tokens';
import { DevCaptcha, FriendlyCaptcha } from './captcha';
import { FakePayments } from './fake-payments';
import { BrevoMailer, DevMailer } from './mailer';
import { CAPTCHA, MAILER, PAYMENTS } from './ports';
import { StripePayments } from './stripe-payments';

@Global()
@Module({})
export class ProvidersModule {
  static forRoot(env: Env): DynamicModule {
    const fakes = fakeProviders(env);
    return {
      module: ProvidersModule,
      providers: [
        {
          provide: MAILER,
          inject: [VALKEY, LOGGER],
          useFactory: (valkey: Redis, logger: Logger) =>
            fakes.mail
              ? new DevMailer(valkey, logger)
              : new BrevoMailer(env.BREVO_API_KEY, env.MAIL_FROM),
        },
        {
          provide: CAPTCHA,
          useFactory: () =>
            fakes.captcha
              ? new DevCaptcha()
              : new FriendlyCaptcha(env.FRIENDLY_CAPTCHA_API_KEY, env.FRIENDLY_CAPTCHA_SITEKEY),
        },
        {
          provide: PAYMENTS,
          inject: [VALKEY],
          useFactory: (valkey: Redis) =>
            fakes.payments
              ? new FakePayments(valkey, env.WEB_BASE_URL)
              : new StripePayments(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET, {
                  plus: env.STRIPE_PRICE_PLUS_YEARLY,
                  premium: env.STRIPE_PRICE_PREMIUM_YEARLY,
                }),
        },
      ],
      exports: [MAILER, CAPTCHA, PAYMENTS],
    };
  }
}
