import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Db } from '../core/core.module';
import { DB } from '../core/tokens';

const Status = z.object({
  id: z.string().max(128),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.coerce.number().optional(),
  errors: z.array(z.object({ code: z.coerce.string() })).optional(),
});
const Payload = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({ value: z.object({ statuses: z.array(z.unknown()).optional() }).loose() }),
        ),
      }),
    )
    .default([]),
});

const RANK = { queued: 0, sent: 1, delivered: 2, read: 3 } as const;

/** NT-04: WhatsApp delivery statuses (Meta Cloud API format, forwarded by 360dialog). */
@Injectable()
export class WhatsAppWebhookService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async handle(body: unknown): Promise<number> {
    const parsed = Payload.safeParse(body);
    if (!parsed.success) return 0;
    let updated = 0;
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        for (const raw of change.value.statuses ?? []) {
          const s = Status.safeParse(raw);
          if (s.success) updated += await this.apply(s.data);
        }
      }
    }
    return updated;
  }

  private async apply(s: z.infer<typeof Status>): Promise<number> {
    const status = s.status;
    const at = s.timestamp ? new Date(s.timestamp * 1000) : new Date();
    const base = this.db
      .updateTable('alert_deliveries')
      .where('channel', '=', 'whatsapp')
      .where('provider_message_id', '=', s.id);
    if (status === 'failed') {
      const r = await base
        .set({ status: 'failed', error_code: s.errors?.[0]?.code.slice(0, 64) ?? 'failed' })
        .where('status', 'in', ['queued', 'sent'])
        .executeTakeFirst();
      return Number(r.numUpdatedRows);
    }
    // Webhooks arrive out of order: never move a delivery backwards (read → delivered).
    const lower = (Object.keys(RANK) as (keyof typeof RANK)[]).filter(
      (k) => RANK[k] < RANK[status],
    );
    const r = await base
      .set({
        status,
        ...(status === 'sent' ? { sent_at: sql`coalesce(sent_at, ${at})` } : {}),
        ...(status !== 'sent' ? { delivered_at: sql`coalesce(delivered_at, ${at})` } : {}),
        ...(status === 'read' ? { read_at: at } : {}),
      })
      .where('status', 'in', lower)
      .executeTakeFirst();
    return Number(r.numUpdatedRows);
  }
}
