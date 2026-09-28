import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PasswordResetService } from './password-reset.service';
import { RolesEnum } from '../enums/roles.enum';
import { User } from '../../user/entities/user.entity';

function createQueryBuilder(candidate: unknown) {
  const queryBuilder = {
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getRawOne: vi.fn().mockResolvedValue(candidate),
    getOne: vi.fn().mockResolvedValue(candidate),
  };

  return queryBuilder;
}

function createService(candidate: unknown, roles: RolesEnum[]) {
  const queryBuilder = createQueryBuilder(candidate);
  const tokenQueryBuilder = createQueryBuilder({
    id: 1,
    userId: 1373,
    type: 1,
    token: 'reset-token',
    expireAt: Math.floor(Date.now() / 1000) + 3600,
  });
  const userRepository = {
    createQueryBuilder: vi.fn(() => queryBuilder),
    findOne: vi.fn(async () => ({
      id: 1373,
      status: User.STATUS_ACTIVE,
      canLogin: 1,
    })),
    update: vi.fn(),
  };
  const userTokenRepository = {
    create: vi.fn((token) => token),
    save: vi.fn(async (token) => token),
    delete: vi.fn(),
    createQueryBuilder: vi.fn(() => tokenQueryBuilder),
  };
  const userLocationRepository = {
    findOne: vi.fn(async () => ({
      location: { id: 9, email: 'from@example.com', isDeleted: false },
    })),
  };
  const locationRepository = {
    findOne: vi.fn(async () => ({ id: 9, email: 'from@example.com' })),
  };
  const assignmentRepository = {
    find: vi.fn(async () => roles.map((item_name) => ({ item_name }))),
  };
  const mailerService = {
    sendEmail: vi.fn(async () => undefined),
  };

  const service = new PasswordResetService(
    userRepository as never,
    userTokenRepository as never,
    userLocationRepository as never,
    locationRepository as never,
    assignmentRepository as never,
    mailerService as never,
  );

  return {
    service,
    queryBuilder,
    tokenQueryBuilder,
    userRepository,
    userTokenRepository,
    assignmentRepository,
    mailerService,
  };
}

describe('PasswordResetService', () => {
  it('selects a user portal reset candidate by customer or teacher role before creating the token', async () => {
    const { service, queryBuilder, userTokenRepository, mailerService } =
      createService(
        {
          user_id: 3398,
          email: 'maurizio@arcadiamusicacademy.com',
          firstname: 'Maurizio',
          lastname: null,
          status: User.STATUS_ACTIVE,
          canLogin: 1,
        },
        [RolesEnum.CUSTOMER],
      );

    await service.requestReset('user', {
      email: 'maurizio@arcadiamusicacademy.com',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'assignment.item_name IN (:...allowedRoles)',
      { allowedRoles: [RolesEnum.CUSTOMER, RolesEnum.TEACHER] },
    );
    expect(userTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3398 }),
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['maurizio@arcadiamusicacademy.com'],
      }),
    );
  });

  it('selects an admin reset candidate by backend role before creating the token', async () => {
    const { service, queryBuilder, userTokenRepository } = createService(
        {
          user_id: 1373,
          email: 'maurizio@arcadiamusicacademy.com',
          firstname: 'Maurizio',
          lastname: null,
          status: User.STATUS_ACTIVE,
          canLogin: 1,
        },
        [RolesEnum.ADMINISTRATOR],
      );

    await service.requestReset('admin', {
      email: 'maurizio@arcadiamusicacademy.com',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'assignment.item_name IN (:...allowedRoles)',
      {
        allowedRoles: [
          RolesEnum.ADMINISTRATOR,
          RolesEnum.OWNER,
          RolesEnum.STAFFMEMBER,
        ],
      },
    );
    expect(userTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1373 }),
    );
  });

  it('rejects an inactive admin reset candidate before creating the token', async () => {
    const { service, queryBuilder, userTokenRepository, mailerService } = createService(
      {
        user_id: 1373,
        email: 'maurizio@arcadiamusicacademy.com',
        firstname: 'Maurizio',
        lastname: null,
        status: User.STATUS_NOT_ACTIVE,
        canLogin: 0,
      },
      [RolesEnum.ADMINISTRATOR],
    );

    await expect(
      service.requestReset('admin', {
        email: 'maurizio@arcadiamusicacademy.com',
      }),
    ).rejects.toThrow('There is no user with such primary email.');

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'assignment.item_name IN (:...allowedRoles)',
      {
        allowedRoles: [
          RolesEnum.ADMINISTRATOR,
          RolesEnum.OWNER,
          RolesEnum.STAFFMEMBER,
        ],
      },
    );
    expect(userTokenRepository.create).not.toHaveBeenCalled();
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects an inactive admin reset token before allowing password reset', async () => {
    const { service, userRepository, tokenQueryBuilder } = createService(
      null,
      [RolesEnum.ADMINISTRATOR],
    );

    userRepository.findOne.mockResolvedValue({
      id: 1373,
      status: User.STATUS_NOT_ACTIVE,
      canLogin: 0,
    });

    await expect(service.validateResetToken('reset-token')).rejects.toThrow(
      'Wrong password reset token.',
    );

    expect(tokenQueryBuilder.getOne).toHaveBeenCalled();
    expect(userRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1373, isDeleted: false },
      select: ['id', 'status', 'canLogin'],
    });
  });

  it('still rejects when no candidate exists for the requested portal role', async () => {
    const { service, userTokenRepository, mailerService } = createService(
      null,
      [],
    );

    await expect(
      service.requestReset('user', {
        email: 'admin-only@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userTokenRepository.create).not.toHaveBeenCalled();
    expect(mailerService.sendEmail).not.toHaveBeenCalled();
  });
});
