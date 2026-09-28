import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Server } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_THROTTLER,
  PASSWORD_RESET_THROTTLER,
} from '../../rate-limit/auth-rate-limit.constants';
import { getAuthIdentityTracker } from '../../rate-limit/auth-identity.tracker';
import { SignInController } from './sign-in.controller';
import { UserSignInController } from './user-sign-in.controller';
import { AdminSignInService } from '../services/admin-sign-in.service';
import { PasswordResetService } from '../services/password-reset.service';
import { UserSignInService } from '../services/user-sign-in.service';

describe('authentication endpoint rate limits', () => {
  let app: INestApplication;

  const adminSignInService = {
    login: vi.fn().mockResolvedValue({
      legacySession: {
        sessionId: 'admin-session',
        identityCookie: null,
      },
    }),
    logout: vi.fn(),
  };
  const userSignInService = {
    login: vi.fn().mockResolvedValue({
      identityCookie: null,
    }),
    logout: vi.fn(),
  };
  const passwordResetService = {
    requestReset: vi.fn().mockResolvedValue({}),
    validateResetToken: vi.fn(),
    resetPassword: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            {
              name: LOGIN_THROTTLER,
              limit: 2,
              ttl: 60_000,
              getTracker: getAuthIdentityTracker,
            },
            {
              name: PASSWORD_RESET_THROTTLER,
              limit: 1,
              ttl: 60_000,
              getTracker: getAuthIdentityTracker,
            },
          ],
        }),
      ],
      controllers: [SignInController, UserSignInController],
      providers: [
        ThrottlerGuard,
        {
          provide: AdminSignInService,
          useValue: adminSignInService,
        },
        {
          provide: UserSignInService,
          useValue: userSignInService,
        },
        {
          provide: PasswordResetService,
          useValue: passwordResetService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    {
      label: 'admin login',
      path: '/admin/sign-in/login',
      body: { email: 'admin@example.com', password: 'secret' },
      allowedRequests: 2,
    },
    {
      label: 'user login',
      path: '/user/sign-in/login',
      body: { identity: 'customer@example.com', password: 'secret' },
      allowedRequests: 2,
    },
    {
      label: 'admin password reset',
      path: '/admin/sign-in/request-password-reset',
      body: { email: 'admin@example.com' },
      allowedRequests: 1,
    },
    {
      label: 'user password reset',
      path: '/user/sign-in/request-password-reset',
      body: { email: 'customer@example.com' },
      allowedRequests: 1,
    },
  ])(
    'returns HTTP 429 after the $label limit is exhausted',
    async ({ path, body, allowedRequests }) => {
      const httpServer = app.getHttpServer() as Server;

      for (let attempt = 0; attempt < allowedRequests; attempt++) {
        await request(httpServer).post(path).send(body).expect(201);
      }

      const response = await request(httpServer)
        .post(path)
        .send(body)
        .expect(429);

      expect(
        response.headers['retry-after-login'] ??
          response.headers['retry-after-passwordreset'],
      ).toBeDefined();
    },
  );

  it('keeps login buckets separate for different accounts behind the same proxy', async () => {
    const httpServer = app.getHttpServer() as Server;

    await request(httpServer)
      .post('/user/sign-in/login')
      .send({ identity: 'first-account', password: 'secret' })
      .expect(201);
    await request(httpServer)
      .post('/user/sign-in/login')
      .send({ identity: 'first-account', password: 'secret' })
      .expect(201);
    await request(httpServer)
      .post('/user/sign-in/login')
      .send({ identity: 'first-account', password: 'secret' })
      .expect(429);

    await request(httpServer)
      .post('/user/sign-in/login')
      .send({ identity: 'second-account', password: 'secret' })
      .expect(201);
  });
});
