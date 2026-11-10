import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'kysely';
import { BillingService } from '../billing/billing.service';
import type { Db } from '../core/core.module';
import { DB } from '../core/tokens';
import { PrivacyService } from '../privacy/privacy.service';
import { DispatchService } from '../notifications/dispatch.service';
import { ESCALATE_TOPIC, EscalationService } from '../notifications/escalation.service';
import { OrdersService, PRINT_TOPIC } from '../orders/orders.service';
import { RemindersService } from '../preferences/reminders.service';
import { DISPATCH_TOPIC, FOLLOWUP_TOPIC } from '../scan/scan.service';
import { OutboxService } from './outbox.service';
import { SchedulerService } from './scheduler.service';

const HOUR = 3_600_000;

/** Registers outbox handlers and periodic jobs, then starts processing. */
@Injectable()
export class WorkerBootstrap implements OnApplicationBootstrap {
  constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(SchedulerService) private readonly scheduler: SchedulerService,
    @Inject(OrdersService) private readonly orders: OrdersService,
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(DispatchService) private readonly dispatch: DispatchService,
    @Inject(EscalationService) private readonly escalation: EscalationService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
    @Inject(DB) private readonly db: Db,
  ) {}

  onApplicationBootstrap() {
    this.outbox.register(PRINT_TOPIC, (p) => this.orders.submitToPrinter(String(p.orderId)));
    this.outbox.register(DISPATCH_TOPIC, (p) => this.dispatch.dispatch(String(p.alertId)));
    this.outbox.register(FOLLOWUP_TOPIC, (p) => this.dispatch.followup(String(p.alertId)));
    this.outbox.register(ESCALATE_TOPIC, (p) => this.escalation.run(String(p.alertId)));
    this.outbox.start();
    this.scheduler.every({
      name: 'subscriptions.expire',
      everyMs: HOUR,
      run: () => this.billing.expireEnded(),
    });
    // US-29/US-30: idempotent, so hourly runs simply catch up on whatever is due.
    this.scheduler.every({
      name: 'reminders',
      everyMs: HOUR,
      quiet: true,
      run: () => this.reminders.runAll(),
    });
    // US-33: the retention schedule (docs 04 §retention), all rules in one SQL function.
    this.scheduler.every({
      name: 'retention',
      everyMs: HOUR,
      run: async () => {
        await sql`SELECT run_retention()`.execute(this.db);
        return 'ok';
      },
    });
    // US-32: accounts whose 24 h grace period is over: processor steps, then the database.
    this.scheduler.every({
      name: 'accounts.delete',
      everyMs: 10 * 60_000,
      quiet: true,
      run: () => this.privacy.processDue(),
    });
    // Escalations fall due at escalate_at; the sweeper picks them up within seconds (02-arch §3 step 8).
    this.scheduler.every({
      name: 'alerts.escalate',
      everyMs: 5_000,
      quiet: true,
      run: () => this.escalation.sweep(),
    });
  }
}
