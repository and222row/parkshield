import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ALERT_TYPE_CODES, CUSTOM_MESSAGE_MAX } from '@parkshield/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SkipCsrf } from '../auth/guards';
import { truncateIp } from '../core/ip';
import { RateLimitService } from '../core/rate-limit.service';
import { ZodPipe } from '../core/zod.pipe';
import { CAPTCHA, type Captcha } from '../providers/ports';
import { ScanService } from './scan.service';

const CreateAlert = z.object({
  type: z.enum(ALERT_TYPE_CODES),
  message: z.string().max(CUSTOM_MESSAGE_MAX).optional(),
  lang: z.enum(['de', 'en']).default('de'),
  captcha: z.string().max(4096).optional(),
});

/** Scanner endpoints: no account, no cookies, no session (SC-01–SC-07). */
@Controller('v1')
@SkipCsrf()
export class ScanController {
  constructor(
    @Inject(ScanService) private readonly scan: ScanService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(CAPTCHA) private readonly captcha: Captcha,
  ) {}

  /** Unknown, revoked and unpaid codes all answer the same; misses are limited per truncated IP. */
  private async resolve(code: string, req: FastifyRequest) {
    const token = await this.scan.lookup(code);
    if (!token) {
      await this.limits.enforce('scan.not_found', truncateIp(req.ip));
      throw new NotFoundException({ error: 'inactive' });
    }
    return token;
  }

  @Get('scan/:code')
  async page(@Param('code') code: string, @Req() req: FastifyRequest) {
    return this.scan.pageData(await this.resolve(code, req));
  }

  @Post('scan/:code/alerts')
  async create(
    @Param('code') code: string,
    @Body(new ZodPipe(CreateAlert)) body: z.infer<typeof CreateAlert>,
    @Req() req: FastifyRequest,
  ) {
    if (!(await this.captcha.verify(body.captcha)))
      throw new BadRequestException({ error: 'captcha_failed' });
    const token = await this.resolve(code, req);
    return this.scan.createAlert(token, body, {
      ipPrefix: truncateIp(req.ip),
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
  }

  @Get('alerts/:id/status')
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-status-token') statusToken: string | undefined,
  ) {
    const s = statusToken ? await this.scan.status(id, statusToken) : null;
    if (!s) throw new NotFoundException({ error: 'not_found' });
    return s;
  }
}
