import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { sql } from 'kysely';
import type { Env } from '../config/env';
import type { Db } from '../core/core.module';
import { randomToken, sha256 } from '../core/crypto';
import { DB, ENV, VALKEY } from '../core/tokens';
import type { OwnerReply } from '../db/types.generated';
import { ESCALATE_TOPIC, EscalationService } from './escalation.service';

export const OWNER_REPLIES = [
  'coming',
  'in_30_min',
  'not_nearby',
] as const satisfies readonly OwnerReply[];

const rawKey = (alertId: string) => `ack:raw:${alertId}`;
const usedKey = (hash: Buffer) => `ack:used:${hash.toString('hex')}`;

export interface ReplyLinks {
  page: string;
  coming: string;
  in_30_min: string;
  not_nearby: string;
}

/**
 * Single-use reply token per alert (NT-02, 02-architecture §5): 256 bits, only the hash in PostgreSQL.
 * The raw token is kept in Valkey until the alert expires, so every channel and every outbox retry of
 * one notification carries the same link. A reply clears the hash; a reminder (NT-09) issues a new one.
 */
@Injectable()
export class AckService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ENV) private readonly env: Env,
    @Inject(EscalationService) private readonly escalation: EscalationService,
  ) {}

  async tokenFor(alertId: string, expiresAt: Date): Promise<string> {
    return (await this.valkey.get(rawKey(alertId))) ?? this.renew(alertId, expiresAt);
  }

  /** Fresh reply buttons (the reminder after "Ich warte noch"). The previous link stops working. */
  async renew(alertId: string, expiresAt: Date): Promise<string> {
    const token = randomToken();
    await this.db
      .updateTable('alerts')
      .set({ ack_token_hash: sha256(token), ack_token_expires_at: expiresAt })
      .where('id', '=', alertId)
      .execute();
    const ttl = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.valkey.set(rawKey(alertId), token, 'EX', ttl);
    return token;
  }

  links(token: string): ReplyLinks {
    const base = `${this.env.WEB_BASE_URL}/antwort`;
    return {
      // The token travels in the fragment: never sent to a server log or in a Referer header.
      page: `${base}#t=${token}`,
      coming: `${base}?r=coming#t=${token}`,
      in_30_min: `${base}?r=in_30_min#t=${token}`,
      not_nearby: `${base}?r=not_nearby#t=${token}`,
    };
  }

  private summary(where: { hash?: Buffer; id?: string }) {
    let q = this.db
      .selectFrom('alerts as a')
      .innerJoin('vehicles as v', 'v.id', 'a.vehicle_id')
      .innerJoin('alert_types as t', 't.code', 'a.alert_type')
      .select([
        'a.id',
        'a.status',
        'a.is_test',
        'a.owner_reply',
        'a.created_at',
        'a.expires_at',
        'a.ack_token_expires_at',
        'a.escalated_at',
        'a.vehicle_id',
        'v.owner_user_id',
        'v.nickname',
        't.escalates',
        't.label_de',
        't.label_en',
      ]);
    if (where.hash) q = q.where('a.ack_token_hash', '=', where.hash);
    if (where.id) q = q.where('a.id', '=', where.id);
    return q.executeTakeFirst();
  }

  /** What the reply page shows before the owner taps (opening the link changes nothing). */
  async preview(token: string) {
    const hash = sha256(token);
    const open = await this.summary({ hash });
    const used = open ? null : await this.valkey.get(usedKey(hash));
    const a = open ?? (used ? await this.summary({ id: used }) : undefined);
    if (!a) throw new NotFoundException({ error: 'link_invalid' });
    const expired =
      a.expires_at < new Date() || (open && (a.ack_token_expires_at ?? a.expires_at) < new Date());
    return {
      nickname: a.nickname,
      type: { de: a.label_de, en: a.label_en },
      isTest: a.is_test,
      createdAt: a.created_at,
      expiresAt: a.expires_at,
      answered: !open,
      reply: a.owner_reply,
      expired: Boolean(expired),
      escalated: a.escalated_at !== null,
    };
  }

  /** NT-10: one atomic update decides status, reply and escalate_at (02-architecture §3 step 6). */
  async reply(
    token: string,
    reply: OwnerReply,
  ): Promise<{ reply: OwnerReply; escalating: boolean }> {
    const hash = sha256(token);
    const a = await this.summary({ hash });
    if (!a) {
      const used = await this.valkey.get(usedKey(hash));
      if (!used) throw new NotFoundException({ error: 'link_invalid' });
      const prior = await this.summary({ id: used });
      throw new ConflictException({ error: 'already_answered', reply: prior?.owner_reply ?? null });
    }
    if (a.expires_at < new Date() || (a.ack_token_expires_at ?? a.expires_at) < new Date()) {
      throw new GoneException({ error: 'link_expired' });
    }

    const applies =
      !a.is_test &&
      a.escalates &&
      (await this.escalation.hasContact(a.owner_user_id, a.vehicle_id));
    const escalateAt =
      reply === 'coming' || !applies
        ? sql`NULL::timestamptz`
        : reply === 'in_30_min'
          ? sql`now() + interval '30 minutes'`
          : sql`now()`;
    const escalating = applies && reply === 'not_nearby' && a.escalated_at === null;

    const updated = await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable('alerts')
        .set({
          status: 'acknowledged',
          owner_reply: reply,
          acknowledged_at: sql`coalesce(acknowledged_at, now())`,
          ack_token_hash: null,
          // After an escalation, a late reply is still shown to the scanner but changes nothing else.
          escalate_at: sql`CASE WHEN escalated_at IS NOT NULL THEN escalate_at ELSE ${escalateAt} END`,
        })
        .where('id', '=', a.id)
        .where('ack_token_hash', '=', hash)
        .where('status', 'in', ['dispatched', 'delivered', 'acknowledged', 'escalated'])
        .returning('id')
        .executeTakeFirst();
      if (row && escalating) {
        await trx
          .insertInto('outbox_events')
          .values({ topic: ESCALATE_TOPIC, payload: JSON.stringify({ alertId: a.id }) })
          .execute();
      }
      return Boolean(row);
    });
    if (!updated) throw new ConflictException({ error: 'already_answered', reply: null });

    const ttl = Math.max(60, Math.ceil((a.expires_at.getTime() - Date.now()) / 1000));
    await this.valkey.set(usedKey(hash), a.id, 'EX', ttl);
    return { reply, escalating };
  }
}
