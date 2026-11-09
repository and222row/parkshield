import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { AlertStatus, AlertTypeCode } from '@parkshield/shared';
import { sql } from 'kysely';
import type { Db } from '../core/core.module';
import type { FieldCrypto } from '../core/crypto';
import { randomToken, sha256 } from '../core/crypto';
import { SettingsService } from '../core/settings.service';
import { CRYPTO, DB } from '../core/tokens';
import { filterText } from '../moderation/text-filter';
import { ScannerRefService } from './scanner-ref.service';

export const DISPATCH_TOPIC = 'alert.dispatch';
const CROCKFORD_CODE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** Crockford decoding is forgiving about look-alikes: O→0, I/L→1, case and hyphens ignored. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CROCKFORD_CODE.test(code) ? code : null;
}

export interface ScanContext {
  ipPrefix: string;
  userAgent: string;
}

@Injectable()
export class ScanService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CRYPTO) private readonly crypto: FieldCrypto,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(ScannerRefService) private readonly refs: ScannerRefService,
  ) {}

  /**
   * A decal works while its code is not revoked and its owner has a live subscription (SC-07).
   * Everything else (unknown, revoked, unpaid) returns null and looks identical to the scanner.
   */
  async lookup(rawCode: string) {
    const code = normalizeCode(rawCode);
    if (!code) return null;
    return (
      (await this.db
        .selectFrom('qr_tokens as t')
        .innerJoin('vehicles as v', 'v.id', 't.vehicle_id')
        .select([
          't.id as tokenId',
          't.status',
          't.test_window_until',
          'v.id as vehicleId',
          'v.nickname',
          'v.color',
          'v.owner_user_id as ownerId',
        ])
        .where('t.code_hash', '=', sha256(code))
        .where('t.status', '<>', 'revoked')
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('subscriptions as s')
              .select('s.id')
              .whereRef('s.user_id', '=', 'v.owner_user_id')
              .where('s.status', 'in', ['active', 'past_due']),
          ),
        )
        .executeTakeFirst()) ?? null
    );
  }

  /** Scanner page data (02-architecture §3 step 1). Never contains the owner's name, plate or number. */
  async pageData(token: NonNullable<Awaited<ReturnType<ScanService['lookup']>>>) {
    const [types, mode] = await Promise.all([
      this.db
        .selectFrom('alert_types')
        .select(['code', 'severity', 'label_de', 'label_en'])
        .where('is_active', '=', true)
        .orderBy('sort_order')
        .execute(),
      this.db
        .selectFrom('vehicle_modes')
        .select('ends_at')
        .where('vehicle_id', '=', token.vehicleId)
        .where('mode', '=', 'short_stop')
        .where('starts_at', '<=', sql<Date>`now()`)
        .where('ends_at', '>', sql<Date>`now()`)
        .orderBy('ends_at', 'desc')
        .executeTakeFirst(),
      // Decal health (OW-15): remember that the decal is still being scanned.
      this.db
        .updateTable('qr_tokens')
        .set({ last_scanned_at: sql`now()` })
        .where('id', '=', token.tokenId)
        .execute(),
    ]);
    return {
      nickname: token.nickname,
      color: token.color,
      testMode: token.test_window_until !== null && token.test_window_until > new Date(),
      backAt: mode?.ends_at ?? null,
      alertTypes: types.map((t) => ({
        code: t.code,
        severity: t.severity,
        de: t.label_de,
        en: t.label_en,
      })),
    };
  }

  /** US-14/US-15: creates the alert and queues its dispatch in the same transaction (outbox). */
  async createAlert(
    token: NonNullable<Awaited<ReturnType<ScanService['lookup']>>>,
    input: { type: AlertTypeCode; message?: string; lang: 'de' | 'en' },
    ctx: ScanContext,
  ): Promise<{ alertId: string; statusToken: string }> {
    const type = await this.db
      .selectFrom('alert_types')
      .select(['code', 'severity'])
      .where('code', '=', input.type)
      .where('is_active', '=', true)
      .executeTakeFirst();
    if (!type) throw new UnprocessableEntityException({ error: 'type_unavailable' });
    const message = input.message?.trim() || undefined;
    if (type.code === 'custom' && !message)
      throw new UnprocessableEntityException({ error: 'message_required' });

    const refs = await this.refs.compute(ctx.ipPrefix, ctx.userAgent, token.tokenId);
    const isTest = token.test_window_until !== null && token.test_window_until > new Date();
    const common = {
      qr_token_id: token.tokenId,
      vehicle_id: token.vehicleId,
      alert_type: type.code,
      severity: type.severity,
      scanner_lang: input.lang,
      scanner_ref: refs.scannerRef,
      block_ref: refs.blockRef,
      is_test: isTest,
      custom_message_enc: message ? this.crypto.encrypt(message) : null,
      key_version: this.crypto.keyVersion,
    };

    // Filtered text never reaches the owner (SC-04). It is kept encrypted for 7 days for the review sample.
    if (message) {
      const verdict = filterText(message);
      if (!verdict.ok) {
        const blocked = await this.db
          .insertInto('alerts')
          .values({
            ...common,
            status: 'blocked',
            moderation: 'blocked',
            status_view_hash: sha256(randomToken()),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const rate = Number(await this.settings.get('moderation.sample_rate', 0.1));
        if (Math.random() < rate) {
          await this.db
            .insertInto('moderation_reviews')
            .values({ alert_id: blocked.id, rule_hit: verdict.reason! })
            .execute();
        }
        throw new UnprocessableEntityException({
          error: 'message_blocked',
          reason: verdict.reason,
        });
      }
    }

    const statusToken = randomToken();
    const blockedScanner = !isTest && (await this.isBlocked(token.tokenId, refs));
    const alertId = await this.db.transaction().execute(async (trx) => {
      const alert = await trx
        .insertInto('alerts')
        .values({
          ...common,
          status: blockedScanner ? 'blocked' : 'dispatched',
          moderation: message ? 'passed' : 'not_required',
          status_view_hash: sha256(statusToken),
          dispatched_at: blockedScanner ? null : sql`now()`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (isTest) {
        // US-12: the test scan activates the decal and closes the test window.
        await trx
          .updateTable('qr_tokens')
          .set({
            status: 'active',
            test_window_until: null,
            last_test_at: sql`now()`,
            activated_at: sql`coalesce(activated_at, now())`,
          })
          .where('id', '=', token.tokenId)
          .execute();
      }
      if (!blockedScanner) {
        await trx
          .insertInto('outbox_events')
          .values({ topic: DISPATCH_TOPIC, payload: JSON.stringify({ alertId: alert.id }) })
          .execute();
      }
      return alert.id;
    });
    return { alertId, statusToken };
  }

  private async isBlocked(
    tokenId: string,
    refs: Awaited<ReturnType<ScannerRefService['compute']>>,
  ) {
    const hit = await this.db
      .selectFrom('scanner_blocks')
      .select('ref')
      .where('expires_at', '>', sql<Date>`now()`)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('qr_token_id', '=', tokenId),
            eb('ref', 'in', [refs.blockRef, refs.blockRefPrevious]),
          ]),
          eb.and([eb('qr_token_id', 'is', null), eb('ref', '=', refs.scannerRef)]),
        ]),
      )
      .executeTakeFirst();
    return Boolean(hit);
  }

  /** US-16: what the scanner may see about their own alert, nothing else. */
  async status(alertId: string, statusToken: string) {
    const a = await this.db
      .selectFrom('alerts')
      .select([
        'id',
        'status',
        'alert_type',
        'is_test',
        'created_at',
        'acknowledged_at',
        'owner_reply',
        'escalated_at',
        'expires_at',
      ])
      .where('id', '=', alertId)
      .where('status_view_hash', '=', sha256(statusToken))
      .executeTakeFirst();
    if (!a) return null;
    const delivered = await this.db
      .selectFrom('alert_deliveries')
      .select((eb) => eb.fn.min('sent_at').as('at'))
      .where('alert_id', '=', a.id)
      .where('recipient', '=', 'owner')
      .where('status', 'in', ['sent', 'delivered', 'read'])
      .executeTakeFirst();
    let status: AlertStatus = a.status;
    // A silently blocked scanner must not learn that (shadow block): it looks like an unanswered alert.
    if (status === 'blocked') status = 'dispatched';
    const open = status === 'created' || status === 'dispatched' || status === 'delivered';
    if (open && a.expires_at < new Date()) status = 'expired';
    return {
      status,
      type: a.alert_type,
      isTest: a.is_test,
      createdAt: a.created_at,
      deliveredAt: a.status === 'blocked' ? null : (delivered?.at ?? null),
      acknowledgedAt: a.acknowledged_at,
      ownerReply: a.owner_reply,
      escalatedAt: a.escalated_at,
      expiresAt: a.expires_at,
    };
  }
}
