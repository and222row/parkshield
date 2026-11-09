import { Inject, Injectable } from '@nestjs/common';
import type { Db } from './core.module';
import { DB } from './tokens';

const TTL_MS = 30_000; // changes take effect well within the 60 s target (NFR "Settings")

/** Runtime settings from app_settings (AD-14). Never hard-code limits or switches (hard rule 6). */
@Injectable()
export class SettingsService {
  private cache = new Map<string, unknown>();
  private loadedAt = 0;

  constructor(@Inject(DB) private readonly db: Db) {}

  private async refresh(): Promise<void> {
    if (Date.now() - this.loadedAt < TTL_MS) return;
    const rows = await this.db.selectFrom('app_settings').select(['key', 'value']).execute();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    this.loadedAt = Date.now();
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    await this.refresh();
    return this.cache.has(key) ? (this.cache.get(key) as T) : fallback;
  }

  invalidate(): void {
    this.loadedAt = 0;
  }
}
