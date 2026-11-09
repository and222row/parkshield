import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { VALKEY } from './tokens';

// One atomic step: increment, start the window on the first hit, and undo the increment when over the
// limit, so rejected requests never consume quota and concurrent requests cannot overshoot (02-arch §5).
const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if n > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then ttl = tonumber(ARGV[2]) end
  return {0, ttl}
end
return {1, tonumber(ARGV[1]) - n}
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimitedException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super({ error: 'rate_limited', retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(VALKEY) private readonly valkey: Redis) {}

  async hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const [ok, n] = (await this.valkey.eval(SCRIPT, 1, `rl:${key}`, max, windowSeconds)) as [
      number,
      number,
    ];
    return ok === 1
      ? { allowed: true, remaining: n, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: n };
  }

  async enforce(key: string, max: number, windowSeconds: number): Promise<void> {
    const r = await this.hit(key, max, windowSeconds);
    if (!r.allowed) throw new RateLimitedException(r.retryAfterSeconds);
  }
}
