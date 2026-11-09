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
import { GeoService } from './core/geo.service';
import { createHttpApp } from './core/http';
import { RateLimitService } from './core/rate-limit.service';
import { SettingsService } from './core/settings.service';
import { DevController } from './dev/dev.controller';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { MailService } from './mail/mail.service';
import { OpsHealthController } from './ops/ops-health.controller';
import { ProvidersModule } from './providers/providers.module';
import { EntitlementService } from './billing/entitlements.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { TokensService } from './vehicles/tokens.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { ChannelsController, WhatsAppWebhookController } from './channels/channels.controller';
import { ChannelsService } from './channels/channels.service';
import { DispatchService } from './notifications/dispatch.service';
import { WhatsAppWebhookService } from './notifications/whatsapp-webhook.service';
import { ScanController } from './scan/scan.controller';
import { ScanService } from './scan/scan.service';
import { ScannerRefService } from './scan/scanner-ref.service';
import { WaitlistController } from './waitlist/waitlist.controller';
import { OutboxService } from './worker/outbox.service';
import { SchedulerService } from './worker/scheduler.service';
import { WorkerBootstrap } from './worker/worker.bootstrap';

const sharedProviders = [HealthService, RateLimitService, SettingsService, MailService, GeoService];
const domainProviders = [
  BillingService,
  EntitlementService,
  TokensService,
  VehiclesService,
  OrdersService,
  ScannerRefService,
  ScanService,
  DispatchService,
  ChannelsService,
  WhatsAppWebhookService,
];

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
        VehiclesController,
        OrdersController,
        ScanController,
        ChannelsController,
        WhatsAppWebhookController,
        ...(devRoutes ? [DevController] : []),
      ],
      providers: [
        ...sharedProviders,
        ...domainProviders,
        SessionService,
        SessionGuard,
        AuthService,
        PasskeyService,
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
      providers: [
        ...sharedProviders,
        ...domainProviders,
        OutboxService,
        SchedulerService,
        WorkerBootstrap,
      ],
    };
  }
}

export const buildPublicApp = (env: Env, logger: Logger) =>
  createHttpApp(PublicAppModule.forRoot(env, logger), logger);

export const buildOpsApp = (env: Env, logger: Logger) =>
  createHttpApp(OpsAppModule.forRoot(env, logger), logger);
