import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Env } from '../config/env';
import { fakeProviders } from '../config/env';
import type { Db } from '../core/core.module';
import type { FieldCrypto } from '../core/crypto';
import { CRYPTO, DB, ENV } from '../core/tokens';
import { MailService } from '../mail/mail.service';

/**
 * Delivers an alert to the owner. Sprint 4 ships the e-mail channel (always available, free);
 * Push, WhatsApp, channel order, urgency fan-out and kill switches follow in US-20–US-22.
 */
@Injectable()
export class DispatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async dispatch(alertId: string): Promise<void> {
    const alert = await this.db
      .selectFrom('alerts as a')
      .innerJoin('vehicles as v', 'v.id', 'a.vehicle_id')
      .innerJoin('users as u', 'u.id', 'v.owner_user_id')
      .innerJoin('alert_types as t', 't.code', 'a.alert_type')
      .select([
        'a.id',
        'a.status',
        'a.is_test',
        'a.custom_message_enc',
        'a.expires_at',
        'v.nickname',
        'u.email',
        'u.preferred_lang',
        't.label_de',
        't.label_en',
      ])
      .where('a.id', '=', alertId)
      .executeTakeFirst();
    if (!alert || alert.status !== 'dispatched' || alert.expires_at < new Date()) return;

    // Replayed outbox events must not notify twice.
    const sent = await this.db
      .selectFrom('alert_deliveries')
      .select('id')
      .where('alert_id', '=', alertId)
      .where('channel', '=', 'email')
      .where('status', 'in', ['sent', 'delivered', 'read'])
      .executeTakeFirst();
    if (sent) return;

    const provider = fakeProviders(this.env).mail ? 'dev' : 'brevo';
    const previous = await this.db
      .selectFrom('alert_deliveries')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('alert_id', '=', alertId)
      .executeTakeFirstOrThrow();
    const delivery = await this.db
      .insertInto('alert_deliveries')
      .values({
        alert_id: alertId,
        recipient: 'owner',
        channel: 'email',
        provider,
        attempt: Number(previous.n) + 1,
        cost_micros_eur: 0,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const message = alert.custom_message_enc ? this.crypto.decrypt(alert.custom_message_enc) : '';
    try {
      await this.mail.send({
        to: alert.email,
        template: alert.is_test ? 'alert_test' : 'alert_received',
        locale: alert.preferred_lang,
        values: {
          nickname: alert.nickname,
          type: alert.preferred_lang === 'en' ? alert.label_en : alert.label_de,
          hasMessage: message ? 'yes' : 'no',
          message,
        },
        actionUrl: `${this.env.WEB_BASE_URL}/konto`,
      });
    } catch (err) {
      await this.db
        .updateTable('alert_deliveries')
        .set({ status: 'failed', error_code: String(err).slice(0, 64) })
        .where('id', '=', delivery.id)
        .execute();
      throw err; // the outbox retries with backoff
    }
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('alert_deliveries')
        .set({ status: 'sent', sent_at: sql`now()` })
        .where('id', '=', delivery.id)
        .execute();
      await trx
        .updateTable('alerts')
        .set({ status: 'delivered' })
        .where('id', '=', alertId)
        .where('status', '=', 'dispatched')
        .execute();
    });
  }
}
