import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { DispatchService } from '../notifications/dispatch.service';
import { ESCALATE_TOPIC, EscalationService } from '../notifications/escalation.service';
import { OrdersService, PRINT_TOPIC } from '../orders/orders.service';
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
    // Escalations fall due at escalate_at; the sweeper picks them up within seconds (02-arch §3 step 8).
    this.scheduler.every({
      name: 'alerts.escalate',
      everyMs: 5_000,
      quiet: true,
      run: () => this.escalation.sweep(),
    });
  }
}
