import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Env } from '../config/env';
import type { Db } from '../core/core.module';
import { deviceLabel, truncateIp } from '../core/ip';
import { DB, ENV } from '../core/tokens';
import { ZodPipe } from '../core/zod.pipe';
import { AuthService } from './auth.service';
import { clearSessionCookies, setSessionCookies } from './cookies';
import { CurrentUser, SessionGuard } from './guards';
import { PasskeyService } from './passkey.service';
import { SessionService, type AuthContext } from './session.service';

const locale = z.enum(['de', 'en']);
const MagicLinkRequest = z.object({
  email: z.email().max(254),
  locale: locale.default('de'),
  captcha: z.string().max(4096).optional(),
});
const MagicLinkConsume = z.object({ token: z.string().min(20).max(100) });
const PasskeyRegister = z.object({
  response: z.looseObject({ id: z.string() }),
  label: z.string().max(60),
});
const PasskeyLogin = z.object({
  challengeId: z.string().max(64),
  response: z.looseObject({ id: z.string() }),
});
const UpdateMe = z.object({ preferredLang: locale });

@Controller('v1')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PasskeyService) private readonly passkeys: PasskeyService,
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get secureCookies() {
    return this.env.NODE_ENV === 'production';
  }

  @Post('auth/magic-link')
  @HttpCode(202)
  async requestMagicLink(
    @Body(new ZodPipe(MagicLinkRequest)) body: z.infer<typeof MagicLinkRequest>,
    @Req() req: FastifyRequest,
  ) {
    await this.auth.requestMagicLink({ ...body, ipPrefix: truncateIp(req.ip) });
    return { ok: true };
  }

  @Post('auth/magic-link/consume')
  @HttpCode(200)
  async consume(
    @Body(new ZodPipe(MagicLinkConsume)) body: z.infer<typeof MagicLinkConsume>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = await this.auth.consumeMagicLink(
      body.token,
      deviceLabel(req.headers['user-agent']),
    );
    if (!session) throw new UnauthorizedException({ error: 'link_invalid_or_used' });
    setSessionCookies(reply, session, this.secureCookies);
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.sessions.revoke(user.sessionId);
    clearSessionCookies(reply, this.secureCookies);
    return { ok: true };
  }

  @Post('auth/passkey/register/options')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  registerOptions(@CurrentUser() user: AuthContext) {
    return this.passkeys.registrationOptions(user);
  }

  @Post('auth/passkey/register/verify')
  @HttpCode(201)
  @UseGuards(SessionGuard)
  async register(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(PasskeyRegister)) body: z.infer<typeof PasskeyRegister>,
  ) {
    await this.passkeys.register(user.userId, body.response as never, body.label);
    return { ok: true };
  }

  @Post('auth/passkey/login/options')
  @HttpCode(200)
  loginOptions() {
    return this.passkeys.loginOptions();
  }

  @Post('auth/passkey/login/verify')
  @HttpCode(200)
  async passkeyLogin(
    @Body(new ZodPipe(PasskeyLogin)) body: z.infer<typeof PasskeyLogin>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const userId = await this.passkeys.login(body.challengeId, body.response as never);
    if (!userId) throw new UnauthorizedException({ error: 'passkey_invalid' });
    const session = await this.auth.signIn(userId, deviceLabel(req.headers['user-agent']));
    setSessionCookies(reply, session, this.secureCookies);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: AuthContext) {
    const passkeys = await this.passkeys.list(user.userId);
    return { email: user.email, preferredLang: user.preferredLang, passkeys };
  }

  @Patch('me')
  @UseGuards(SessionGuard)
  async updateMe(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(UpdateMe)) body: z.infer<typeof UpdateMe>,
  ) {
    await this.db
      .updateTable('users')
      .set({ preferred_lang: body.preferredLang })
      .where('id', '=', user.userId)
      .execute();
    return { ok: true };
  }

  @Delete('me/passkeys/:id')
  @UseGuards(SessionGuard)
  async removePasskey(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!(await this.passkeys.remove(user.userId, id))) throw new NotFoundException();
    return { ok: true };
  }
}
