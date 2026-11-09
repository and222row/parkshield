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
    trustProxy: true,
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
