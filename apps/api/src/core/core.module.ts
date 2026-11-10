import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Logger } from 'pino';
import type { Env } from '../config/env';
import type { DB as Database } from '../db/types.generated';
import { FieldCrypto } from './crypto';
import { CRYPTO, DB, ENV, LOGGER, VALKEY } from './tokens';

export type Db = Kysely<Database>;

@Global()
@Module({})
export class CoreModule implements OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: CoreModule,
      providers: [
        { provide: ENV, useValue: env },
        { provide: LOGGER, useValue: logger },
        { provide: CRYPTO, useFactory: () => FieldCrypto.fromEnv(process.env, env.BIDX_KEY) },
        {
          provide: DB,
          useFactory: () =>
            new Kysely<Database>({
              dialect: new PostgresDialect({
                pool: new pg.Pool({
                  connectionString: env.DATABASE_URL,
                  max: 10,
                  // Keep connections warm: a new PostgreSQL backend costs ~400 ms on Windows (and a
                  // few ms on Linux). The default 10 s idle timeout made every burst reconnect.
                  idleTimeoutMillis: 5 * 60_000,
                  keepAlive: true,
                }),
              }),
            }),
        },
        {
          provide: VALKEY,
          useFactory: () => new Redis(env.VALKEY_URL, { maxRetriesPerRequest: null }),
        },
      ],
      exports: [ENV, LOGGER, DB, VALKEY, CRYPTO],
    };
  }

  async onApplicationShutdown() {
    await this.db.destroy();
    this.valkey.disconnect();
  }
}
