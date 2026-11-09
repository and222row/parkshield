import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Logger } from 'pino';
import type { Env } from '../config/env';
import { fakeProviders } from '../config/env';
import type { Db } from '../core/core.module';
import type { FieldCrypto } from '../core/crypto';
import { SettingsService } from '../core/settings.service';
import { CRYPTO, DB, ENV, LOGGER } from '../core/tokens';
import { MailService } from '../mail/mail.service';
import { PUSH, WHATSAPP, type PushSender, type WhatsAppSender } from '../providers/ports';
import type { ChannelType } from '../db/types.generated';
import { pushText, type PushKind } from './push-texts';

/** NT-06: a subscription is removed after HTTP 404/410 or this many consecutive failures. */
export const PUSH_MAX_FAILURES = 5;
const PUSH_TTL_SECONDS = 2 * 3600;
const DONE = ['sent', 'delivered', 'read'] as const;

type AlertRow = NonNullable<Awaited<ReturnType<DispatchService['load']>>>;
type Outcome = 'sent' | 'failed' | 'suppressed' | 'skipped';

/**
 * Delivers an alert to the owner on every enabled channel: e-mail (always), each Web Push device
 * (US-20) and WhatsApp when linked (US-21). Kill switches (NT-12) suppress a channel at once.
 * Channel priority and "stop at first success" for normal alerts follow with US-22.
 *
 * Idempotent: a replayed outbox event never notifies a channel (or push device) twice.
 * E-mail and WhatsApp errors are rethrown so the outbox retries; push errors are not,
 * because they are counted per device (NT-06) and retrying would double-count.
 */
@Injectable()
export class DispatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(PUSH) private readonly push: PushSender,
    @Inject(WHATSAPP) private readonly whatsapp: WhatsAppSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  private load(alertId: string) {
    return this.db
      .selectFrom('alerts as a')
      .innerJoin('vehicles as v', 'v.id', 'a.vehicle_id')
      .innerJoin('users as u', 'u.id', 'v.owner_user_id')
      .innerJoin('alert_types as t', 't.code', 'a.alert_type')
      .select([
        'a.id',
        'a.status',
        'a.is_test',
        'a.severity',
        'a.custom_message_enc',
        'a.expires_at',
        'a.followup_sent_at',
        'a.scanner_waiting_at',
        'v.nickname',
        'u.id as userId',
        'u.email',
        'u.preferred_lang',
        't.label_de',
        't.label_en',
      ])
      .where('a.id', '=', alertId)
      .executeTakeFirst();
  }

  async dispatch(alertId: string): Promise<void> {
    const alert = await this.load(alertId);
    if (
      !alert ||
      !['dispatched', 'delivered'].includes(alert.status) ||
      alert.expires_at < new Date()
    )
      return;

    const errors: unknown[] = [];
    const run = async (fn: () => Promise<Outcome>) => {
      try {
        return await fn();
      } catch (err) {
        errors.push(err);
        return 'failed' as const;
      }
    };
    const outcomes = [
      await run(() => this.sendEmail(alert, alert.is_test ? 'alert_test' : 'alert_received')),
      ...(await this.sendPushAll(alert, alert.is_test ? 'test' : 'alert')),
      await run(() => this.sendWhatsApp(alert, alert.is_test ? 'ps_test' : 'ps_alert')),
    ];

    if (outcomes.includes('sent')) {
      await this.db
        .updateTable('alerts')
        .set({ status: 'delivered' })
        .where('id', '=', alertId)
        .where('status', '=', 'dispatched')
        .execute();
    }
    if (errors.length) throw errors[0]; // the outbox retries; channels already sent are skipped
  }

  /** NT-09: one reminder on the fastest channel (Push, otherwise WhatsApp, otherwise e-mail). */
  async followup(alertId: string): Promise<void> {
    const alert = await this.load(alertId);
    if (
      !alert ||
      alert.followup_sent_at ||
      !alert.scanner_waiting_at ||
      alert.status !== 'acknowledged'
    )
      return;
    const pushed = (await this.sendPushAll(alert, 'followup', { dedupe: false })).includes('sent');
    if (!pushed) {
      // A WhatsApp error falls through to e-mail instead of retrying (a retry would push again).
      const wa = await this.sendWhatsApp(alert, 'ps_followup', { dedupe: false }).catch(
        () => 'failed' as const,
      );
      if (wa !== 'sent') await this.sendEmail(alert, 'alert_followup', { dedupe: false });
    }
    await this.db
      .updateTable('alerts')
      .set({ followup_sent_at: sql`now()` })
      .where('id', '=', alertId)
      .where('followup_sent_at', 'is', null)
      .execute();
  }

  // --- channels --------------------------------------------------------------------------------

  private async enabled(channel: ChannelType): Promise<boolean> {
    const v = await this.settings.get<unknown>(`channels.${channel}.enabled`, true);
    return v === true || v === 'true';
  }

  private async alreadySent(alertId: string, channel: ChannelType, providerMessageId?: string) {
    let q = this.db
      .selectFrom('alert_deliveries')
      .select('id')
      .where('alert_id', '=', alertId)
      .where('channel', '=', channel)
      .where('status', 'in', [...DONE]);
    if (providerMessageId) q = q.where('provider_message_id', '=', providerMessageId);
    return Boolean(await q.executeTakeFirst());
  }

  private async record(input: {
    alertId: string;
    channel: ChannelType;
    provider: string;
    status: 'queued' | 'suppressed';
    reason?: string;
    providerMessageId?: string;
    costMicros?: number;
  }) {
    const previous = await this.db
      .selectFrom('alert_deliveries')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('alert_id', '=', input.alertId)
      .where('channel', '=', input.channel)
      .executeTakeFirstOrThrow();
    return this.db
      .insertInto('alert_deliveries')
      .values({
        alert_id: input.alertId,
        recipient: 'owner',
        channel: input.channel,
        provider: input.provider,
        status: input.status,
        suppressed_reason: input.reason ?? null,
        provider_message_id: input.providerMessageId ?? null,
        attempt: Number(previous.n) + 1,
        cost_micros_eur: input.costMicros ?? 0,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  private async finish(
    id: string,
    result: { ok: true; messageId?: string } | { ok: false; error: string },
  ) {
    await this.db
      .updateTable('alert_deliveries')
      .set(
        result.ok
          ? {
              status: 'sent',
              sent_at: sql`now()`,
              ...(result.messageId ? { provider_message_id: result.messageId } : {}),
            }
          : { status: 'failed', error_code: result.error.slice(0, 64) },
      )
      .where('id', '=', id)
      .execute();
  }

  private alertValues(alert: AlertRow) {
    const message = alert.custom_message_enc ? this.crypto.decrypt(alert.custom_message_enc) : '';
    return {
      nickname: alert.nickname,
      type: alert.preferred_lang === 'en' ? alert.label_en : alert.label_de,
      hasMessage: message ? 'yes' : 'no',
      message,
    };
  }

  private async sendEmail(
    alert: AlertRow,
    template: 'alert_received' | 'alert_test' | 'alert_followup',
    opts = { dedupe: true },
  ): Promise<Outcome> {
    const provider = fakeProviders(this.env).mail ? 'dev' : 'brevo';
    if (opts.dedupe && (await this.alreadySent(alert.id, 'email'))) return 'skipped';
    if (!(await this.enabled('email'))) {
      await this.record({
        alertId: alert.id,
        channel: 'email',
        provider,
        status: 'suppressed',
        reason: 'kill_switch',
      });
      return 'suppressed';
    }
    const delivery = await this.record({
      alertId: alert.id,
      channel: 'email',
      provider,
      status: 'queued',
    });
    try {
      await this.mail.send({
        to: alert.email,
        template,
        locale: alert.preferred_lang,
        values: this.alertValues(alert),
        actionUrl: `${this.env.WEB_BASE_URL}/konto`,
      });
    } catch (err) {
      await this.finish(delivery.id, { ok: false, error: String(err) });
      throw err;
    }
    await this.finish(delivery.id, { ok: true });
    return 'sent';
  }

  private async sendPushAll(
    alert: AlertRow,
    kind: PushKind,
    opts = { dedupe: true },
  ): Promise<Outcome[]> {
    const devices = await this.db
      .selectFrom('push_subscriptions')
      .select(['id', 'endpoint', 'p256dh', 'auth', 'device_label', 'platform', 'failed_count'])
      .where('user_id', '=', alert.userId)
      .execute();
    if (!devices.length) return [];
    if (!(await this.enabled('webpush'))) {
      await this.record({
        alertId: alert.id,
        channel: 'webpush',
        provider: 'vapid',
        status: 'suppressed',
        reason: 'kill_switch',
      });
      return ['suppressed'];
    }
    const values = this.alertValues(alert);
    const text = pushText(alert.preferred_lang, kind, values.type, values.nickname);
    const payload = JSON.stringify({
      ...text,
      url: `${this.env.WEB_BASE_URL}/konto`,
      tag: `alert-${alert.id}`,
    });
    const urgent = alert.severity === 'urgent' || kind === 'followup';

    return Promise.all(
      devices.map(async (d): Promise<Outcome> => {
        // The subscription id marks the device, so each device is notified at most once per alert.
        const marker = `sub:${d.id}`;
        if (opts.dedupe && (await this.alreadySent(alert.id, 'webpush', marker))) return 'skipped';
        const delivery = await this.record({
          alertId: alert.id,
          channel: 'webpush',
          provider: 'vapid',
          status: 'queued',
          providerMessageId: marker,
        });
        const { statusCode } = await this.push.send(d, payload, {
          ttlSeconds: PUSH_TTL_SECONDS,
          urgency: urgent ? 'high' : 'normal',
        });
        if (statusCode >= 200 && statusCode < 300) {
          await this.finish(delivery.id, { ok: true });
          await this.db
            .updateTable('push_subscriptions')
            .set({ last_ok_at: sql`now()`, failed_count: 0 })
            .where('id', '=', d.id)
            .execute();
          return 'sent';
        }
        await this.finish(delivery.id, { ok: false, error: `http_${statusCode}` });
        const gone = statusCode === 404 || statusCode === 410;
        if (gone || d.failed_count + 1 >= PUSH_MAX_FAILURES) {
          await this.removeDevice(alert, d, gone ? 'gone' : 'failures');
        } else {
          await this.db
            .updateTable('push_subscriptions')
            .set({ failed_count: sql`failed_count + 1` })
            .where('id', '=', d.id)
            .execute();
        }
        return 'failed';
      }),
    );
  }

  /** NT-06: remove the subscription and tell the owner by e-mail how to turn push back on. */
  private async removeDevice(
    alert: AlertRow,
    d: { id: string; device_label: string | null; platform: string | null },
    why: 'gone' | 'failures',
  ) {
    const removed = await this.db
      .deleteFrom('push_subscriptions')
      .where('id', '=', d.id)
      .executeTakeFirst();
    if (!Number(removed.numDeletedRows)) return;
    this.logger.info({ why }, 'push subscription removed');
    const device =
      d.device_label ??
      (alert.preferred_lang === 'en'
        ? { ios: 'your iPhone', android: 'your Android phone', desktop: 'your computer' }
        : { ios: 'Ihrem iPhone', android: 'Ihrem Android-Gerät', desktop: 'Ihrem Computer' })[
        (d.platform as 'ios' | 'android' | 'desktop') ?? 'desktop'
      ] ??
      'device';
    await this.mail
      .send({
        to: alert.email,
        template: 'push_removed',
        locale: alert.preferred_lang,
        values: { device },
        actionUrl: `${this.env.WEB_BASE_URL}/konto/benachrichtigungen`,
      })
      .catch((err: unknown) => this.logger.warn({ err: String(err) }, 'push_removed mail failed'));
  }

  private async sendWhatsApp(
    alert: AlertRow,
    template: 'ps_alert' | 'ps_test' | 'ps_followup',
    opts = { dedupe: true },
  ): Promise<Outcome> {
    const channel = await this.db
      .selectFrom('contact_channels')
      .select(['address_enc'])
      .where('user_id', '=', alert.userId)
      .where('type', '=', 'whatsapp')
      .where('is_enabled', '=', true)
      .where('verified_at', 'is not', null)
      .where('opted_in_at', 'is not', null)
      .executeTakeFirst();
    if (!channel?.address_enc) return 'skipped';
    const provider = fakeProviders(this.env).whatsapp ? 'dev' : '360dialog';
    if (opts.dedupe && (await this.alreadySent(alert.id, 'whatsapp'))) return 'skipped';
    if (!(await this.enabled('whatsapp'))) {
      await this.record({
        alertId: alert.id,
        channel: 'whatsapp',
        provider,
        status: 'suppressed',
        reason: 'kill_switch',
      });
      return 'suppressed';
    }
    const cost = Number(await this.settings.get('whatsapp.cost_micros', 55_000));
    const delivery = await this.record({
      alertId: alert.id,
      channel: 'whatsapp',
      provider,
      status: 'queued',
      costMicros: cost,
    });
    const values = this.alertValues(alert);
    try {
      const { messageId } = await this.whatsapp.sendTemplate({
        to: this.crypto.decrypt(channel.address_enc).replace(/^\+/, ''),
        template,
        lang: alert.preferred_lang,
        params: template === 'ps_test' ? [values.nickname] : [values.type, values.nickname],
      });
      await this.finish(delivery.id, { ok: true, messageId });
      return 'sent';
    } catch (err) {
      await this.finish(delivery.id, { ok: false, error: String(err) });
      throw err;
    }
  }
}
