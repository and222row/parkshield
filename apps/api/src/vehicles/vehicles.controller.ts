import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CTA_MAX, DECAL_PRODUCTS, DECAL_TEMPLATES } from '@parkshield/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser, SessionGuard } from '../auth/guards';
import type { AuthContext } from '../auth/session.service';
import type { Env } from '../config/env';
import { ENV } from '../core/tokens';
import { ZodPipe } from '../core/zod.pipe';
import { layoutDecal } from '../decal/layout';
import { renderHomePdf } from '../decal/pdf';
import { renderSvg } from '../decal/svg';
import { filterText } from '../moderation/text-filter';
import { VehiclesService } from './vehicles.service';

const plate = z
  .string()
  .trim()
  .min(2)
  .max(12)
  .regex(/^[A-Za-zÄÖÜäöü0-9 -]+$/);
const Vehicle = z.object({
  nickname: z.string().trim().min(1).max(60),
  plate,
  makeModel: z.string().trim().max(80).nullish(),
  color: z.string().trim().max(30).nullish(),
});
const Design = z.object({
  template: z.enum(DECAL_TEMPLATES),
  cta: z.string().trim().min(1).max(CTA_MAX),
});
const Reissue = z.object({
  // "Explicit confirmation" (02-architecture §10): the client must state that the old decal stops working.
  confirm: z.literal(true),
  reason: z.enum(['leaked', 'car_sold', 'damaged', 'other']).default('other'),
});
const Preview = Design.partial().extend({
  product: z.enum(DECAL_PRODUCTS).default('uv_vinyl_sticker'),
});

function checkCta(cta: string | undefined) {
  if (cta === undefined) return;
  const r = filterText(cta);
  if (!r.ok) throw new BadRequestException({ error: 'cta_not_allowed', reason: r.reason });
}

@Controller('v1/vehicles')
@UseGuards(SessionGuard)
export class VehiclesController {
  constructor(
    @Inject(VehiclesService) private readonly vehicles: VehiclesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthContext) {
    return { vehicles: await this.vehicles.list(user.userId) };
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(Vehicle)) body: z.infer<typeof Vehicle>,
  ) {
    return this.vehicles.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.get(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(Vehicle.partial())) body: Partial<z.infer<typeof Vehicle>>,
  ) {
    return this.vehicles.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.vehicles.remove(user.userId, id);
    return { ok: true };
  }

  /** US-13: revoke the current code and issue a new one (02-architecture §10). */
  @Post(':id/tokens')
  reissue(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(Reissue)) body: z.infer<typeof Reissue>,
  ) {
    return this.vehicles.revokeAndReissue(user.userId, id, body.reason);
  }

  /** US-12: "Aufkleber testen". */
  @Post(':id/test-window')
  @HttpCode(200)
  async testWindow(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    const { until, code } = await this.vehicles.openTestWindow(user.userId, id);
    // The owner's own decal URL, so they can also open the test on this device.
    return { until, scanUrl: `${this.env.SCANNER_BASE_URL}/s/${code}` };
  }

  @Put(':id/decal')
  saveDesign(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(Design)) body: z.infer<typeof Design>,
  ) {
    checkCta(body.cta);
    return this.vehicles.saveDesign(user.userId, id, body);
  }

  /** Live preview (OW-03): unsaved template/header from the query, real code of the owner's decal. */
  @Get(':id/decal.svg')
  async preview(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(Preview)) q: z.infer<typeof Preview>,
    @Res() reply: FastifyReply,
  ) {
    checkCta(q.cta);
    const { token, code } = await this.vehicles.currentToken(user.userId, id);
    const spec = layoutDecal({
      code,
      scannerBaseUrl: this.env.SCANNER_BASE_URL,
      template: q.template ?? (token.design_template_id as never),
      cta: q.cta ?? token.cta_header,
      product: q.product,
    });
    return reply
      .header('content-type', 'image/svg+xml; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(renderSvg(spec, 'ParkShield-Aufkleber'));
  }

  /** Free print-at-home PDF at any time (OW-04). */
  @Get(':id/decal.pdf')
  async homePdf(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reply: FastifyReply,
  ) {
    const { token, code } = await this.vehicles.currentToken(user.userId, id);
    const spec = layoutDecal({
      code,
      scannerBaseUrl: this.env.SCANNER_BASE_URL,
      template: token.design_template_id as never,
      cta: token.cta_header,
      product: 'uv_vinyl_sticker',
    });
    const pdf = await renderHomePdf(spec, 'ParkShield-Aufkleber');
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', 'attachment; filename="parkshield-aufkleber.pdf"')
      .header('cache-control', 'no-store')
      .send(pdf);
  }
}
