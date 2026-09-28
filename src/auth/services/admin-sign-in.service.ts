import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
// import { randomBytes, createHmac } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { User } from '../../user/entities/user.entity';
import { RolesEnum } from '../enums/roles.enum';
import { RbacAuthAssignment } from '../entities/rbac-auth-assignment.entity';
import { RbacAuthItemChild } from '../entities/rbac-auth-item-child.entity';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { AdminLoginResponseDto } from '../dto/admin-login-response.dto';

type LoginCandidate = {
  user_id: number;
  access_token: string;
  // auth_key: string;
  password_hash: string | null;
  email: string;
  status: number;
  canLogin: number;
};

/* export type LegacyAdminSession = {
  sessionId: string;
  identityCookie?: {
    value: string;
    expires: Date;
  };
};

type AdminLoginResult = AdminLoginResponseDto & {
  legacySession: LegacyAdminSession;
}; */

@Injectable()
export class AdminSignInService {
  private readonly backendRoles = [
    RolesEnum.ADMINISTRATOR,
    RolesEnum.OWNER,
    RolesEnum.STAFFMEMBER,
  ];
  // private readonly defaultYiiSessionTimeout = 1440;
  // private readonly rememberMeDuration = 30 * 24 * 60 * 60;
  private readonly inactiveAccountMessage =
    'Your account is inactive. Please contact the administrator.';

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    @InjectRepository(RbacAuthItemChild)
    private readonly itemChildRepository: Repository<RbacAuthItemChild>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
  ) {}

  async login(dto: AdminLoginDto): Promise<AdminLoginResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const candidate = await this.findBackendUserByPrimaryEmail(email);

    if (!candidate) {
      throw new UnauthorizedException('Incorrect username or password.');
    }

    if (!candidate.password_hash) {
      throw new UnauthorizedException('Incorrect username or password.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      this.normalizeBcryptHash(candidate.password_hash),
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Incorrect username or password.');
    }

    const roles = await this.getUserRoles(candidate.user_id);
    const backendRoles = roles.filter((role) => this.backendRoles.includes(role as RolesEnum));

    if (backendRoles.length === 0) {
      throw new ForbiddenException('You are not allowed to login.');
    }

    if (
      Number(candidate.status) !== User.STATUS_ACTIVE ||
      !Boolean(Number(candidate.canLogin))
    ) {
      throw new ForbiddenException(this.inactiveAccountMessage);
    }

    const selectedRole = this.selectPrimaryBackendRole(backendRoles);
    const location = await this.resolveLoginLocation(candidate.user_id, selectedRole);
    const hasLoginToBackend = await this.hasLoginToBackendPermission(backendRoles, location.id);

    if (!hasLoginToBackend) {
      throw new ForbiddenException('You are not allowed to login.');
    }

    await this.userRepository.update(candidate.user_id, {
      logged_at: Math.floor(Date.now() / 1000),
    });

    /* const legacySession = await this.createLegacyAdminSession(
      candidate.user_id,
      candidate.auth_key,
      location.slug,
      dto.rememberMe,
    ); */

    return {
      token: candidate.access_token,
      accessToken: candidate.access_token,
      location: location.slug,
      id: candidate.user_id,
      user: {
        id: candidate.user_id,
        role: selectedRole,
        roles,
        email: candidate.email,
      },
      redirectUrl: `/admin/${location.slug}/dashboard`,
      // legacySession,
    };
  }

  async logout(sessionId?: string): Promise<{ status: true }> {
    /* if (sessionId) {
      await this.dataSource.query('DELETE FROM `session` WHERE `id` = ?', [sessionId]);
    } */

    return { status: true };
  }

  private async findBackendUserByPrimaryEmail(email: string): Promise<LoginCandidate | null> {
    const row = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user_contact', 'contact', 'contact.userId = user.id')
      .innerJoin('user_email', 'email', 'email.userContactId = contact.id')
      .innerJoin('rbac_auth_assignment', 'assignment', 'assignment.user_id = CAST(user.id AS CHAR)')
      .select('user.id', 'user_id')
      .addSelect('user.access_token', 'access_token')
      // .addSelect('user.auth_key', 'auth_key')
      .addSelect('user.password_hash', 'password_hash')
      .addSelect('user.status', 'status')
      .addSelect('user.canLogin', 'canLogin')
      .addSelect('email.email', 'email')
      .where('LOWER(email.email) = :email', { email })
      .andWhere('contact.isPrimary = 1')
      .andWhere('contact.isDeleted = 0')
      .andWhere('email.isDeleted = 0')
      .andWhere('user.isDeleted = 0')
      .andWhere('assignment.item_name IN (:...roles)', { roles: this.backendRoles })
      .orderBy('user.id', 'ASC')
      .limit(1)
      .getRawOne<LoginCandidate>();

    return row || null;
  }

  private async getUserRoles(userId: number): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({
      where: { user_id: userId.toString() },
      select: ['item_name'],
    });

    return assignments.map((assignment) => assignment.item_name);
  }

  private selectPrimaryBackendRole(roles: string[]): string {
    const priority = [RolesEnum.ADMINISTRATOR, RolesEnum.OWNER, RolesEnum.STAFFMEMBER];
    return priority.find((role) => roles.includes(role)) || roles[0];
  }

  private async resolveLoginLocation(userId: number, role: string): Promise<Location> {
    if (role === RolesEnum.ADMINISTRATOR) {
      const adminLocation = await this.locationRepository.findOne({
        where: { id: 1, isDeleted: false },
      });

      if (adminLocation) {
        return adminLocation;
      }
    }

    const userLocation = await this.userLocationRepository.findOne({
      where: { userId },
      relations: ['location'],
      order: { id: 'ASC' },
    });

    if (userLocation?.location && !userLocation.location.isDeleted) {
      return userLocation.location;
    }

    const fallbackLocation = await this.locationRepository.findOne({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });

    if (!fallbackLocation) {
      throw new ForbiddenException('No active location is available for this user.');
    }

    return fallbackLocation;
  }

  private async hasLoginToBackendPermission(roles: string[], locationId: number): Promise<boolean> {
    const visited = new Set<string>();
    const pending = [...roles];

    while (pending.length > 0) {
      const parent = pending.shift();
      if (!parent || visited.has(parent)) {
        continue;
      }
      visited.add(parent);

      const children = await this.itemChildRepository
        .createQueryBuilder('child')
        .where('child.parent = :parent', { parent })
        .andWhere('(child.locationId IS NULL OR child.locationId = :locationId)', { locationId })
        .getMany();

      for (const child of children) {
        if (child.child === 'loginToBackend') {
          return true;
        }
        if (!visited.has(child.child)) {
          pending.push(child.child);
        }
      }
    }

    return false;
  }

  private normalizeBcryptHash(hash: string): string {
    return hash.replace(/^\$2y\$/, '$2a$');
  }

  /* private async createLegacyAdminSession(
    userId: number,
    authKey: string,
    locationSlug: string,
    rememberMe?: boolean,
  ): Promise<LegacyAdminSession> {
    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + this.getYiiSessionTimeout();
    const sessionData = this.encodeYiiSessionData(userId, authKey, locationSlug);

    await this.dataSource.query(
      'INSERT INTO `session` (`id`, `expire`, `data`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `expire` = VALUES(`expire`), `data` = VALUES(`data`)',
      [sessionId, expiresAt, sessionData],
    );

    return {
      sessionId,
      identityCookie: rememberMe ? this.createIdentityCookie(userId, authKey) : undefined,
    };
  }

  private createIdentityCookie(
    userId: number,
    authKey: string,
  ): LegacyAdminSession['identityCookie'] {
    const validationKey = process.env.BACKEND_COOKIE_VALIDATION_KEY;
    if (!validationKey) {
      return undefined;
    }

    const value = JSON.stringify([userId, authKey, this.rememberMeDuration]);

    return {
      value: this.createYiiSignedCookieValue('_identity', value, validationKey),
      expires: new Date(Date.now() + this.rememberMeDuration * 1000),
    };
  }

  private encodeYiiSessionData(userId: number, authKey: string, locationSlug: string): string {
    return [
      '__flash|a:0:{}',
      `__id|i:${userId};`,
      `__authKey|s:${Buffer.byteLength(authKey, 'utf8')}:"${authKey}";`,
      `_location|s:${Buffer.byteLength(locationSlug, 'utf8')}:"${locationSlug}";`,
      'showReleaseNotesOnLogin|i:2;',
    ].join('');
  }

  private createYiiSignedCookieValue(cookieName: string, value: string, validationKey: string): string {
    const serialized = this.phpSerializeArray([cookieName, value]);
    const hash = createHmac('sha256', validationKey).update(serialized).digest('hex');

    return `${hash}${serialized}`;
  }

  private phpSerializeArray(values: string[]): string {
    const entries = values
      .map((value, index) => `i:${index};${this.phpSerializeString(value)}`)
      .join('');

    return `a:${values.length}:{${entries}}`;
  }

  private phpSerializeString(value: string): string {
    return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  }

  private getYiiSessionTimeout(): number {
    const configuredTimeout = Number(process.env.YII_SESSION_TIMEOUT);

    return Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : this.defaultYiiSessionTimeout;
  } */
}
