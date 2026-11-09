import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';
import { PinoNestLogger } from './logger';

export async function createHttpApp(
  rootModule: unknown,
  logger: Logger,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    // Only Caddy and the Next.js server (loopback / private network) may set X-Forwarded-For;
    // a client-supplied header must never decide the IP used for rate limits.
    trustProxy: ['127.0.0.1', '::1', '10.0.0.0/8'],
    genReqId: () => randomUUID(),
    bodyLimit: 64 * 1024,
  });
  const app = await NestFactory.create<NestFastifyApplication>(rootModule as never, adapter, {
    logger: new PinoNestLogger(logger),
    rawBody: true, // Stripe webhook signatures are computed over the raw body
  });
  await app.register(fastifyCookie as never);
  app.enableShutdownHooks();
  return app;
}
