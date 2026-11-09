import { Module, type DynamicModule } from '@nestjs/common';
import type { Logger } from 'pino';
import type { Env } from './config/env';
import { CoreModule } from './core/core.module';
import { createHttpApp } from './core/http';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { OpsHealthController } from './ops/ops-health.controller';

/** Public API: scanner, owner portal, webhooks. Never registers ops routes (AD-01). */
@Module({})
export class PublicAppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: PublicAppModule,
      imports: [CoreModule.forRoot(env, logger)],
      controllers: [HealthController],
      providers: [HealthService],
    };
  }
}

/** api-ops: ops routes only, bound to the WireGuard interface in production. */
@Module({})
export class OpsAppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: OpsAppModule,
      imports: [CoreModule.forRoot(env, logger)],
      controllers: [OpsHealthController],
      providers: [HealthService],
    };
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return { module: WorkerModule, imports: [CoreModule.forRoot(env, logger)] };
  }
}

export const buildPublicApp = (env: Env, logger: Logger) =>
  createHttpApp(PublicAppModule.forRoot(env, logger), logger);

export const buildOpsApp = (env: Env, logger: Logger) =>
  createHttpApp(OpsAppModule.forRoot(env, logger), logger);
