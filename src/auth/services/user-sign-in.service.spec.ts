import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { User } from '../../user/entities/user.entity';
import { RolesEnum } from '../enums/roles.enum';
import { UserSignInService } from './user-sign-in.service';

type LoginCandidate = {
  user_id: number;
  access_token: string;
  auth_key: string;
  password_hash: string;
  email: string;
  status: number;
  canLogin: number;
};

function createQueryBuilder(candidates: LoginCandidate[]) {
  return {
    innerJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue(candidates),
  };
}

function createService(candidates: LoginCandidate[]) {
  const queryBuilder = createQueryBuilder(candidates);
  const userRepository = {
    createQueryBuilder: vi.fn(() => queryBuilder),
    update: vi
      .fn<(userId: number, data: { logged_at: number }) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  const assignmentRepository = {
    find: vi.fn().mockResolvedValue([{ item_name: RolesEnum.TEACHER }]),
  };
  const userLocationRepository = {
    findOne: vi.fn(({ where }: { where: { userId: number } }) =>
      Promise.resolve({
        location: {
          id: where.userId,
          slug: where.userId === 20 ? 'maple' : 'newmarket',
          isDeleted: false,
        },
      }),
    ),
  };
  const locationRepository = {
    findOne: vi.fn(),
  };

  const service = new UserSignInService(
    userRepository as never,
    assignmentRepository as never,
    userLocationRepository as never,
    locationRepository as never,
  );

  return { service, userRepository, userLocationRepository };
}

function candidate(
  userId: number,
  password: string,
  status: number,
): LoginCandidate {
  return {
    user_id: userId,
    access_token: `token-${userId}`,
    auth_key: `auth-${userId}`,
    password_hash: bcrypt.hashSync(password, 4),
    email: 'teacher@example.com',
    status,
    canLogin: status === User.STATUS_ACTIVE ? 1 : 0,
  };
}

describe('UserSignInService', () => {
  it('uses an active location record when an earlier matching record is inactive', async () => {
    const { service, userRepository, userLocationRepository } = createService([
      candidate(10, 'shared-password', User.STATUS_NOT_ACTIVE),
      candidate(20, 'shared-password', User.STATUS_ACTIVE),
    ]);

    const result = await service.login({
      identity: 'teacher@example.com',
      password: 'shared-password',
    });

    expect(result.id).toBe(20);
    expect(result.location).toBe('maple');
    expect(userLocationRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 20 } }),
    );
    expect(userRepository.update).toHaveBeenCalledOnce();
    expect(userRepository.update.mock.calls[0]?.[0]).toBe(20);
    expect(userRepository.update.mock.calls[0]?.[1].logged_at).toEqual(
      expect.any(Number),
    );
  });

  it('uses an active related record when only the inactive record matches the password', async () => {
    const { service, userLocationRepository } = createService([
      candidate(10, 'old-location-password', User.STATUS_NOT_ACTIVE),
      candidate(20, 'active-location-password', User.STATUS_ACTIVE),
    ]);

    const result = await service.login({
      identity: 'teacher@example.com',
      password: 'old-location-password',
    });

    expect(result.id).toBe(20);
    expect(result.location).toBe('maple');
    expect(userLocationRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 20 } }),
    );
  });

  it('keeps the inactive error when no related record is active', async () => {
    const { service } = createService([
      candidate(10, 'inactive-password', User.STATUS_NOT_ACTIVE),
    ]);

    await expect(
      service.login({
        identity: 'teacher@example.com',
        password: 'inactive-password',
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        'Your account is inactive. Please contact the office.',
      ),
    );
  });
});
