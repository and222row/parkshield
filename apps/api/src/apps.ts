import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Logger } from 'pino';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CsrfGuard, SessionGuard } from './auth/guards';
import { PasskeyService } from './auth/passkey.service';
import { SessionService } from './auth/session.service';
import { BillingController, StripeWebhookController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { fakeProviders, type Env } from './config/env';
import { CoreModule } from './core/core.module';
import { createHttpApp } from './core/http';
import { RateLimitService } from './core/rate-limit.service';
import { SettingsService } from './core/settings.service';
import { DevController } from './dev/dev.controller';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { MailService } from './mail/mail.service';
import { OpsHealthController } from './ops/ops-health.controller';
import { ProvidersModule } from './providers/providers.module';
import { WaitlistController } from './waitlist/waitlist.controller';

const sharedProviders = [HealthService, RateLimitService, SettingsService, MailService];

/** Public API: scanner, owner portal, webhooks. Never registers ops routes (AD-01). */
@Module({})
export class PublicAppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    const fakes = Object.values(fakeProviders(env)).some(Boolean);
    const devRoutes = fakes && env.NODE_ENV !== 'production';
    return {
      module: PublicAppModule,
      imports: [CoreModule.forRoot(env, logger), ProvidersModule.forRoot(env)],
      controllers: [
        HealthController,
        AuthController,
        BillingController,
        StripeWebhookController,
        WaitlistController,
        ...(devRoutes ? [DevController] : []),
      ],
      providers: [
        ...sharedProviders,
        SessionService,
        SessionGuard,
        AuthService,
        PasskeyService,
        BillingService,
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    };
  }
}

/** api-ops: ops routes only, bound to the WireGuard interface in production. */
@Module({})
export class OpsAppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: OpsAppModule,
      imports: [CoreModule.forRoot(env, logger), ProvidersModule.forRoot(env)],
      controllers: [OpsHealthController],
      providers: [...sharedProviders],
    };
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: WorkerModule,
      imports: [CoreModule.forRoot(env, logger), ProvidersModule.forRoot(env)],
      providers: [...sharedProviders],
    };
  }
}

export const buildPublicApp = (env: Env, logger: Logger) =>
  createHttpApp(PublicAppModule.forRoot(env, logger), logger);

export const buildOpsApp = (env: Env, logger: Logger) =>
  createHttpApp(OpsAppModule.forRoot(env, logger), logger);
