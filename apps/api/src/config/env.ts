import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

const key32 = z
  .string()
  .refine((s) => Buffer.from(s, 'base64').length === 32, 'must be 32 random bytes, base64');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  VALKEY_URL: z.url(),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  OPS_API_HOST: z.string().default('127.0.0.1'),
  OPS_API_PORT: z.coerce.number().int().positive().default(4001),
  SCANNER_BASE_URL: z.url(),
  WEB_BASE_URL: z.url(),
  OPS_BASE_URL: z.url(),
  DATA_KEY_V1: key32,
  BIDX_KEY: key32,
  BLOCK_KEY_CURRENT: key32,
  BLOCK_KEY_PREVIOUS: key32,
  SESSION_SECRET: key32,
  APP_ENV: z.string().default('local'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PRICE_PLUS_YEARLY: z.string().default(''),
  STRIPE_PRICE_PREMIUM_YEARLY: z.string().default(''),
  BREVO_API_KEY: z.string().default(''),
  MAIL_FROM: z.string().default('ParkShield <hallo@parkshield.de>'),
  FRIENDLY_CAPTCHA_SITEKEY: z.string().default(''),
  FRIENDLY_CAPTCHA_API_KEY: z.string().default(''),
});

/** Providers without keys fall back to local fakes, which are never allowed in production. */
export function fakeProviders(env: Env) {
  return {
    mail: !env.BREVO_API_KEY,
    captcha: !env.FRIENDLY_CAPTCHA_API_KEY || !env.FRIENDLY_CAPTCHA_SITEKEY,
    payments: !env.STRIPE_SECRET_KEY,
  };
}
export type Env = z.infer<typeof envSchema>;

function findRepoRoot(start: string): string | undefined {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'turbo.json'))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

/** Loads the repo-root .env in local dev (production injects real environment variables) and validates. */
export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const root = findRepoRoot(process.cwd());
  if (root && existsSync(join(root, '.env'))) config({ path: join(root, '.env'), quiet: true });
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const fakes = Object.entries(fakeProviders(parsed.data)).filter(([, isFake]) => isFake);
  if (parsed.data.NODE_ENV === 'production' && parsed.data.APP_ENV !== 'ci' && fakes.length) {
    throw new Error(`Missing provider keys in production: ${fakes.map(([p]) => p).join(', ')}`);
  }
  return parsed.data;
}
