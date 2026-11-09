import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Redis } from 'ioredis';
import { sql } from 'kysely';
import type { Env } from '../config/env';
import type { Db } from '../core/core.module';
import { randomToken } from '../core/crypto';
import { DB, ENV, VALKEY } from '../core/tokens';

const CHALLENGE_TTL = 300;

@Injectable()
export class PasskeyService {
  private readonly rpID: string;
  private readonly origin: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ENV) env: Env,
  ) {
    const url = new URL(env.WEB_BASE_URL);
    this.rpID = url.hostname;
    this.origin = url.origin;
  }

  async registrationOptions(user: { userId: string; email: string }) {
    const existing = await this.db
      .selectFrom('webauthn_credentials')
      .select(['credential_id', 'transports'])
      .where('user_id', '=', user.userId)
      .execute();
    const options = await generateRegistrationOptions({
      rpName: 'ParkShield',
      rpID: this.rpID,
      userName: user.email,
      userID: Buffer.from(user.userId.replaceAll('-', ''), 'hex'),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id.toString('base64url'),
        transports: (c.transports ?? undefined) as never,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    await this.valkey.set(`webauthn:reg:${user.userId}`, options.challenge, 'EX', CHALLENGE_TTL);
    return options;
  }

  async register(userId: string, response: RegistrationResponseJSON, label: string): Promise<void> {
    const expectedChallenge = await this.valkey.getdel(`webauthn:reg:${userId}`);
    if (!expectedChallenge) throw new BadRequestException({ error: 'challenge_expired' });
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
    }).catch(() => ({ verified: false as const }));
    if (!result.verified) throw new BadRequestException({ error: 'passkey_invalid' });
    const { credential } = result.registrationInfo;
    await this.db
      .insertInto('webauthn_credentials')
      .values({
        user_id: userId,
        credential_id: Buffer.from(credential.id, 'base64url'),
        public_key: Buffer.from(credential.publicKey),
        sign_count: credential.counter,
        transports: credential.transports ?? null,
        label: label.slice(0, 60),
      })
      .execute();
  }

  async loginOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
    });
    const challengeId = randomToken(16);
    await this.valkey.set(`webauthn:login:${challengeId}`, options.challenge, 'EX', CHALLENGE_TTL);
    return { challengeId, options };
  }

  /** Returns the user id when the assertion is valid. */
  async login(challengeId: string, response: AuthenticationResponseJSON): Promise<string | null> {
    const expectedChallenge = await this.valkey.getdel(`webauthn:login:${challengeId}`);
    if (!expectedChallenge) return null;
    const cred = await this.db
      .selectFrom('webauthn_credentials as c')
      .innerJoin('users as u', 'u.id', 'c.user_id')
      .select([
        'c.id',
        'c.user_id',
        'c.public_key',
        'c.sign_count',
        'c.transports',
        'c.credential_id',
      ])
      .where('c.credential_id', '=', Buffer.from(response.id, 'base64url'))
      .where('u.status', '=', 'active')
      .executeTakeFirst();
    if (!cred) return null;
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: cred.credential_id.toString('base64url'),
        publicKey: new Uint8Array(cred.public_key),
        counter: Number(cred.sign_count),
        transports: cred.transports ?? undefined,
      },
    }).catch(() => null);
    if (!result?.verified) return null;
    await this.db
      .updateTable('webauthn_credentials')
      .set({ sign_count: result.authenticationInfo.newCounter, last_used_at: sql`now()` })
      .where('id', '=', cred.id)
      .execute();
    return cred.user_id;
  }

  list(userId: string) {
    return this.db
      .selectFrom('webauthn_credentials')
      .select(['id', 'label', 'created_at as createdAt', 'last_used_at as lastUsedAt'])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .execute();
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const r = await this.db
      .deleteFrom('webauthn_credentials')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(r.numDeletedRows) > 0;
  }
}
