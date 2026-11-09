import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'kysely';
import type { Logger } from 'pino';
import type { Db } from '../core/core.module';
import { DB, LOGGER } from '../core/tokens';

export type OutboxHandler = (payload: Record<string, unknown>) => Promise<void>;

const MAX_ATTEMPTS = 10;

/**
 * Transactional outbox (02-architecture §3 step 3–4): producers insert events in the same transaction as
 * their data; the worker claims them with SKIP LOCKED, so several workers never process the same event.
 * Failures retry with exponential backoff; after 10 attempts the event is parked for ops.
 */
@Injectable()
export class OutboxService implements OnModuleDestroy {
  private readonly handlers = new Map<string, OutboxHandler>();
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  register(topic: string, handler: OutboxHandler): void {
    this.handlers.set(topic, handler);
  }

  start(intervalMs = 1000): void {
    this.timer = setInterval(() => {
      if (!this.running) this.running = this.drain().finally(() => (this.running = null));
    }, intervalMs);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  /** Processes due events until none are left; returns how many succeeded. */
  async drain(batch = 20): Promise<number> {
    let done = 0;
    for (;;) {
      const processed = await this.db.transaction().execute(async (trx) => {
        const events = await trx
          .selectFrom('outbox_events')
          .select(['id', 'topic', 'payload', 'attempts'])
          .where('processed_at', 'is', null)
          .where('available_at', '<=', sql<Date>`now()`)
          .where('attempts', '<', MAX_ATTEMPTS)
          .where('topic', 'in', [...this.handlers.keys()])
          .orderBy('id')
          .limit(batch)
          .forUpdate()
          .skipLocked()
          .execute();
        for (const e of events) {
          try {
            await this.handlers.get(e.topic)!(e.payload as Record<string, unknown>);
            await trx
              .updateTable('outbox_events')
              .set({ processed_at: sql`now()` })
              .where('id', '=', e.id)
              .execute();
            done++;
          } catch (err) {
            const attempts = e.attempts + 1;
            this.logger.error(
              { topic: e.topic, eventId: e.id, attempts, err: String(err) },
              'outbox handler failed',
            );
            await trx
              .updateTable('outbox_events')
              .set({
                attempts,
                available_at: sql`now() + make_interval(secs => ${Math.min(3600, 2 ** attempts * 5)})`,
              })
              .where('id', '=', e.id)
              .execute();
          }
        }
        return events.length;
      });
      if (processed < batch) return done;
    }
  }
}
